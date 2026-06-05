import { Readable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Settings } from '@ai-orchestrator/shared';
import { config } from '../config/index';
import { badGateway } from '../lib/errors';
import { nowIso, requestId } from '../lib/ids';
import { logger } from '../lib/logger';
import { buildResponseHeaders, readTailWeb, safeText } from '../orchestrator/proxy';
import type { DispatchOptions } from '../orchestrator/dispatcher';
import type { AnalyticsRecorder } from '../analytics/recorder';
import type { RealtimeHub } from '../realtime/hub';
import type { ProviderManager } from './manager';
import type { ProviderConfig } from './types';
import { extractOpenAIUsage } from './util';

/**
 * Cloud overflow ("spillover"): when every local Ollama node is saturated, the
 * dispatcher routes the request here instead of queueing on busy nodes. The
 * inbound request — which may speak the Ollama API — is translated to an
 * OpenAI-compatible `chat/completions` call against the configured provider, and
 * the response is translated back to the inbound API's shape (streaming too).
 *
 * Only OpenAI-compatible providers (openai/xai/mistral/openai-compatible) are
 * used for overflow; they must have an API key and a default model configured.
 */

/** Endpoints eligible for cloud overflow (everything else stays node-only). */
const OVERFLOW_ENDPOINTS = new Set(['/api/chat', '/api/generate', '/v1/chat/completions']);

export function overflowSupports(endpoint: string): boolean {
  return OVERFLOW_ENDPOINTS.has(endpoint);
}

/** Whether overflow is enabled and the endpoint can be translated. */
export function overflowEnabled(settings: Settings, endpoint: string): boolean {
  return settings.cloudOverflow && overflowSupports(endpoint);
}

/**
 * Choose the provider to overflow to: the one pinned in settings, or the first
 * enabled OpenAI-compatible provider with both an API key and a default model.
 * Returns null when none is usable (→ caller falls back to node queueing).
 */
export function pickOverflowProvider(
  pm: ProviderManager,
  settings: Settings,
): ProviderConfig | null {
  const usable = pm
    .list()
    .filter(
      (c) =>
        c.enabled &&
        pm.isOpenAIFamily(c.type) &&
        !!c.credentials.apiKey &&
        !!c.defaultModel &&
        !!pm.baseUrlFor(c),
    );
  if (settings.cloudOverflowProviderId) {
    return usable.find((c) => c.id === settings.cloudOverflowProviderId) ?? null;
  }
  return usable[0] ?? null;
}

type Format = 'openai' | 'ollama-chat' | 'ollama-generate';

interface OllamaOptions {
  temperature?: unknown;
  top_p?: unknown;
  seed?: unknown;
  num_predict?: unknown;
  stop?: unknown;
  presence_penalty?: unknown;
  frequency_penalty?: unknown;
}

/** Map the common Ollama `options` to top-level OpenAI sampling params. */
function mapOptions(options: unknown): Record<string, unknown> {
  const o = (options ?? {}) as OllamaOptions;
  const out: Record<string, unknown> = {};
  if (typeof o.temperature === 'number') out.temperature = o.temperature;
  if (typeof o.top_p === 'number') out.top_p = o.top_p;
  if (typeof o.seed === 'number') out.seed = o.seed;
  if (typeof o.num_predict === 'number') out.max_tokens = o.num_predict;
  if (typeof o.presence_penalty === 'number') out.presence_penalty = o.presence_penalty;
  if (typeof o.frequency_penalty === 'number') out.frequency_penalty = o.frequency_penalty;
  if (typeof o.stop === 'string' || Array.isArray(o.stop)) out.stop = o.stop;
  return out;
}

interface OllamaMessage {
  role?: unknown;
  content?: unknown;
}

/**
 * Translate an inbound request body into an OpenAI `chat/completions` payload.
 * Returns the payload, whether to stream, and the response format to emit.
 * Note: Ollama image/multimodal content is dropped (text-only overflow).
 */
export function toOpenAIRequest(
  endpoint: string,
  body: Record<string, unknown>,
  targetModel: string,
): { payload: Record<string, unknown>; stream: boolean; format: Format } {
  if (endpoint === '/v1/chat/completions') {
    const stream = body.stream === true;
    const payload: Record<string, unknown> = { ...body, model: targetModel };
    if (stream) payload.stream_options = { include_usage: true };
    return { payload, stream, format: 'openai' };
  }

  // Ollama defaults to streaming when `stream` is omitted.
  const stream = body.stream !== false;
  let messages: { role: string; content: string }[];
  let format: Format;

  if (endpoint === '/api/generate') {
    format = 'ollama-generate';
    messages = [];
    if (typeof body.system === 'string' && body.system) {
      messages.push({ role: 'system', content: body.system });
    }
    messages.push({ role: 'user', content: typeof body.prompt === 'string' ? body.prompt : '' });
  } else {
    format = 'ollama-chat';
    const raw = Array.isArray(body.messages) ? (body.messages as OllamaMessage[]) : [];
    messages = raw.map((m) => ({
      role: typeof m.role === 'string' ? m.role : 'user',
      content: typeof m.content === 'string' ? m.content : '',
    }));
  }

  const payload: Record<string, unknown> = {
    model: targetModel,
    messages,
    stream,
    ...mapOptions(body.options),
  };
  if (stream) payload.stream_options = { include_usage: true };
  return { payload, stream, format };
}

/**
 * Incremental translator from an OpenAI SSE stream to Ollama NDJSON objects.
 * Pure (no I/O) so it is unit-testable: feed `push(text)` chunks, then `end()`.
 */
export class OllamaStreamTranslator {
  private buf = '';
  private finishReason = 'stop';
  promptTokens: number | null = null;
  completionTokens: number | null = null;

  constructor(
    private readonly model: string,
    private readonly isChat: boolean,
  ) {}

  push(text: string): Record<string, unknown>[] {
    this.buf += text;
    const out: Record<string, unknown>[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      const obj = this.consume(line);
      if (obj) out.push(obj);
    }
    return out;
  }

  private consume(line: string): Record<string, unknown> | null {
    if (!line.startsWith('data:')) return null;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') return null;
    let json: {
      choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      json = JSON.parse(data);
    } catch {
      return null;
    }
    const choice = json.choices?.[0];
    if (typeof choice?.finish_reason === 'string') this.finishReason = choice.finish_reason;
    if (json.usage) {
      this.promptTokens = json.usage.prompt_tokens ?? this.promptTokens;
      this.completionTokens = json.usage.completion_tokens ?? this.completionTokens;
    }
    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) return this.frame(delta, false);
    return null;
  }

  end(): Record<string, unknown> {
    return this.frame('', true);
  }

  private frame(content: string, done: boolean): Record<string, unknown> {
    const base: Record<string, unknown> = { model: this.model, created_at: nowIso(), done };
    const body = this.isChat
      ? { ...base, message: { role: 'assistant', content } }
      : { ...base, response: content };
    if (!done) return body;
    return {
      ...body,
      done_reason: this.finishReason,
      prompt_eval_count: this.promptTokens ?? 0,
      eval_count: this.completionTokens ?? 0,
    };
  }
}

/** Translate a non-streaming OpenAI chat completion into an Ollama response. */
export function openAIJsonToOllama(
  json: Record<string, unknown>,
  model: string,
  isChat: boolean,
): { body: Record<string, unknown>; promptTokens: number | null; completionTokens: number | null } {
  const choice = (
    json.choices as { message?: { content?: unknown }; finish_reason?: unknown }[]
  )?.[0];
  const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  const promptTokens = usage?.prompt_tokens ?? null;
  const completionTokens = usage?.completion_tokens ?? null;
  const doneReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : 'stop';
  const base = {
    model,
    created_at: nowIso(),
    done: true,
    done_reason: doneReason,
    prompt_eval_count: promptTokens ?? 0,
    eval_count: completionTokens ?? 0,
  };
  const body = isChat
    ? { ...base, message: { role: 'assistant', content } }
    : { ...base, response: content };
  return { body, promptTokens, completionTokens };
}

export interface OverflowDeps {
  provider: ProviderConfig;
  providerManager: ProviderManager;
  hub: RealtimeHub;
  recorder: AnalyticsRecorder;
}

/**
 * Execute a cloud-overflow request: translate, call the provider, translate the
 * response back, and record realtime + analytics events. Hijacks the reply.
 */
export async function runOverflow(
  deps: OverflowDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  opts: DispatchOptions,
): Promise<void> {
  const { provider, providerManager, hub, recorder } = deps;
  const baseUrl = providerManager.baseUrlFor(provider);
  const targetModel = provider.defaultModel ?? '';
  if (!baseUrl || !targetModel) {
    // Should not happen (pickOverflowProvider guards), but be defensive.
    throw badGateway('Overflow provider is not fully configured.');
  }
  // Echo the model the client asked for, not the cloud target.
  const reportModel = opts.model ?? targetModel;

  let body: Record<string, unknown> = {};
  const buf = request.body as Buffer | undefined;
  if (buf && buf.length) {
    try {
      body = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const { payload, stream, format } = toOpenAIRequest(opts.endpoint, body, targetModel);

  const headers: Record<string, string> = { 'content-type': 'application/json', accept: '*/*' };
  if (provider.credentials.apiKey) headers.authorization = `Bearer ${provider.credentials.apiKey}`;

  const id = requestId();
  const started = performance.now();
  hub.broadcast({
    type: 'request:start',
    id,
    nodeId: null,
    provider: provider.type,
    model: reportModel,
    endpoint: opts.endpoint,
    at: nowIso(),
  });

  const record = async (
    status: number,
    promptTokens: number | null,
    completionTokens: number | null,
    error: string | null,
  ): Promise<void> => {
    const latencyMs = Math.round(performance.now() - started);
    hub.broadcast({
      type: 'request:end',
      id,
      nodeId: null,
      provider: provider.type,
      model: reportModel,
      endpoint: opts.endpoint,
      status,
      latencyMs,
      promptTokens,
      completionTokens,
      at: nowIso(),
    });
    await recorder.record({
      requestId: id,
      nodeId: null,
      provider: provider.type,
      model: reportModel,
      endpoint: opts.endpoint,
      status,
      latencyMs,
      promptTokens,
      completionTokens,
      error,
      clientKeyId: opts.clientKeyId,
    });
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.requestTimeoutMs);

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    await record(502, null, null, (err as Error).message);
    throw badGateway(`Overflow provider request failed: ${(err as Error).message}`);
  }

  logger.info(
    {
      provider: provider.name,
      endpoint: opts.endpoint,
      model: reportModel,
      status: upstream.status,
    },
    'request overflowed to cloud provider',
  );

  reply.hijack();
  const res: ServerResponse = reply.raw;
  res.on('close', () => ctrl.abort());

  // Provider error → surface it in the inbound API's error shape.
  if (!upstream.ok) {
    const text = await safeText(upstream);
    clearTimeout(timer);
    if (format === 'openai') {
      res.writeHead(upstream.status, buildResponseHeaders(upstream.headers));
      res.end(text);
    } else {
      res.writeHead(upstream.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: text || `provider returned ${upstream.status}` }));
    }
    await record(upstream.status, null, null, text || `upstream ${upstream.status}`);
    return;
  }

  // OpenAI inbound (/v1): the provider's response already matches — pass through.
  if (format === 'openai') {
    const outHeaders = buildResponseHeaders(upstream.headers);
    outHeaders['x-orchestrator-overflow'] = provider.name;
    res.writeHead(upstream.status, outHeaders);
    if (!upstream.body) {
      res.end();
      clearTimeout(timer);
      await record(upstream.status, null, null, null);
      return;
    }
    const [toClient, toParse] = upstream.body.tee();
    const readable = Readable.fromWeb(
      toClient as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    readable.on('error', () => res.end());
    readable.pipe(res);
    void (async () => {
      try {
        const tail = await readTailWeb(toParse);
        const usage = extractOpenAIUsage(tail);
        await record(upstream.status, usage.promptTokens, usage.completionTokens, null);
      } catch {
        await record(upstream.status, null, null, null);
      } finally {
        clearTimeout(timer);
      }
    })();
    return;
  }

  // Ollama inbound (/api/chat, /api/generate): translate the response.
  const isChat = format === 'ollama-chat';
  if (!stream) {
    let json: Record<string, unknown> = {};
    try {
      json = (await upstream.json()) as Record<string, unknown>;
    } catch {
      /* empty */
    }
    const out = openAIJsonToOllama(json, reportModel, isChat);
    clearTimeout(timer);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'x-orchestrator-overflow': provider.name,
    });
    res.end(JSON.stringify(out.body));
    await record(200, out.promptTokens, out.completionTokens, null);
    return;
  }

  // Streaming: OpenAI SSE → Ollama NDJSON, line by line.
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache',
    'x-orchestrator-overflow': provider.name,
  });
  const translator = new OllamaStreamTranslator(reportModel, isChat);
  try {
    if (upstream.body) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const obj of translator.push(decoder.decode(value, { stream: true }))) {
          res.write(JSON.stringify(obj) + '\n');
        }
      }
    }
    res.write(JSON.stringify(translator.end()) + '\n');
    res.end();
    await record(200, translator.promptTokens, translator.completionTokens, null);
  } catch (err) {
    res.end();
    await record(200, translator.promptTokens, translator.completionTokens, (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
