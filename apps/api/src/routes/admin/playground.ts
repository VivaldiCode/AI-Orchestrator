import { Writable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  playgroundRequestSchema,
  type PlaygroundFormat,
  type PlaygroundModelGroup,
  type PlaygroundResult,
} from '@ai-orchestrator/shared';
import { runAnthropicMessages } from '../../anthropic/run';
import { config } from '../../config/index';
import { db } from '../../db/client';
import { modelRoutes } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { ProviderConfig, ResolvedRoute } from '../../providers/types';
import { handle as handleOpenAI } from '../openai/index';
import { parseWith } from './util';

/**
 * Admin **Query Playground**: replays a request through the real inference path
 * (`/v1/chat/completions` or `/v1/messages`) and captures the response — so the
 * dashboard can test providers in either the OpenAI or Anthropic format without
 * juggling an API key or hitting CORS. Routing, overflow, budgets and privacy
 * all apply, exactly as for a normal client.
 */

/** A ServerResponse-like sink that captures status, headers and body. */
class CapturingRaw extends Writable {
  statusCode = 200;
  headers: Record<string, string> = {};
  private chunks: Buffer[] = [];

  writeHead(status: number, headers?: Record<string, string>): this {
    this.statusCode = status;
    if (headers) for (const [k, v] of Object.entries(headers)) this.headers[k.toLowerCase()] = String(v);
    return this;
  }
  setHeader(k: string, v: string | number): void {
    this.headers[k.toLowerCase()] = String(v);
  }
  getHeader(k: string): string | undefined {
    return this.headers[k.toLowerCase()];
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
    this.chunks.push(Buffer.from(chunk));
    cb();
  }
  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

/** A minimal Fastify reply that records both `raw` writes and `send()` payloads. */
function capturingReply(): { reply: FastifyReply; raw: CapturingRaw; done: Promise<void> } {
  const raw = new CapturingRaw();
  const done = new Promise<void>((resolve) => raw.on('finish', () => resolve()));
  const reply = {
    raw,
    statusCode: 200,
    hijack() {},
    code(n: number) {
      (this as { statusCode: number }).statusCode = n;
      raw.statusCode = n;
      return this;
    },
    header(k: string, v: string) {
      raw.setHeader(k, v);
      return this;
    },
    send(payload: unknown) {
      raw.statusCode = (this as { statusCode: number }).statusCode;
      if (payload == null) raw.end();
      else if (typeof payload === 'string') raw.end(payload);
      else if (Buffer.isBuffer(payload)) raw.end(payload);
      else {
        raw.setHeader('content-type', 'application/json; charset=utf-8');
        raw.end(JSON.stringify(payload));
      }
      return this;
    },
  } as unknown as FastifyReply;
  return { reply, raw, done };
}

/** Build a synthetic buffered request the production handlers understand. */
function syntheticRequest(url: string, body: Record<string, unknown>, ip: string | null): FastifyRequest {
  return {
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-orchestrator-playground': '1',
    },
    body: Buffer.from(JSON.stringify(body)),
    ip,
    clientKeyId: null,
  } as unknown as FastifyRequest;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/** Replay a request through the real path and capture the result. */
export async function runPlayground(
  app: FastifyInstance,
  format: PlaygroundFormat,
  body: Record<string, unknown>,
  ctx: { ip: string | null },
  providerId?: string,
): Promise<PlaygroundResult> {
  // A specific provider forces that provider directly (skips the alias registry),
  // so the playground can test any configured provider, not just routed aliases.
  let override: ResolvedRoute | undefined;
  if (providerId && providerId !== 'ollama') {
    const cfg = app.providers.getConfig(providerId);
    if (!cfg) {
      return {
        status: 400,
        latencyMs: 0,
        servedBy: { nodeId: null, nodeName: null, provider: null },
        contentType: 'application/json',
        body: { error: 'Provider not found.' },
        raw: '{"error":"Provider not found."}',
      };
    }
    const model = typeof body.model === 'string' ? body.model : '';
    override = { providerType: cfg.type, targetModel: model, provider: cfg };
  }

  const url = format === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';
  const req = syntheticRequest(url, body, ctx.ip);
  const { reply, raw, done } = capturingReply();
  const started = performance.now();

  try {
    if (format === 'anthropic') await runAnthropicMessages(app, req, reply, override);
    else await handleOpenAI(app, req, reply, '/v1/chat/completions', override);
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Playground request failed.';
    return {
      status,
      latencyMs: Math.round(performance.now() - started),
      servedBy: { nodeId: null, nodeName: null, provider: null },
      contentType: 'application/json',
      body: { error: message },
      raw: JSON.stringify({ error: message }),
    };
  }

  // Handlers hijack + stream asynchronously; wait for the response to finish.
  await Promise.race([done, delay(config.requestTimeoutMs + 5000)]);

  const text = raw.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep the raw string (e.g. SSE) */
  }
  const h = raw.headers;
  return {
    status: raw.statusCode,
    latencyMs: Math.round(performance.now() - started),
    servedBy: {
      nodeId: h['x-orchestrator-node'] ?? null,
      nodeName: h['x-orchestrator-node-name'] ?? null,
      provider: h['x-orchestrator-provider'] ?? h['x-orchestrator-overflow'] ?? null,
    },
    contentType: h['content-type'] ?? null,
    body: parsed,
    raw: text,
  };
}

const MODELS_TIMEOUT_MS = 5000;

/** Best-effort live model catalog for a provider via its `/v1/models` endpoint. */
async function fetchProviderModels(app: FastifyInstance, p: ProviderConfig): Promise<string[]> {
  const key = p.credentials.apiKey;
  if (!key || p.type === 'bedrock') return [];
  const isAnthropic = p.type === 'anthropic';
  const baseUrl = isAnthropic ? p.baseUrl || 'https://api.anthropic.com' : app.providers.baseUrlFor(p);
  if (!baseUrl) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODELS_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = isAnthropic
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01', accept: 'application/json' }
      : { authorization: `Bearer ${key}`, accept: 'application/json' };
    const res = await fetch(`${baseUrl}/v1/models`, { headers, signal: ctrl.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { id?: unknown }[] };
    return (json.data ?? []).map((m) => (typeof m.id === 'string' ? m.id : '')).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function registerPlaygroundRoutes(app: FastifyInstance): void {
  const read = { preHandler: app.requirePermission('providers:read') };

  app.post('/playground', read, async (req, reply) => {
    const input = parseWith(playgroundRequestSchema, req.body);
    const result = await runPlayground(app, input.format, input.body, { ip: req.ip ?? null }, input.providerId);
    return reply.send(result);
  });

  // Provider + model choices for the playground pickers: local node models and
  // each provider's routed aliases (+ default model). The model name returned is
  // exactly what to put in the request `model` field.
  app.get('/playground/options', read, async (_req, reply) => {
    const nodeModels = new Set<string>();
    for (const n of app.orchestrator.registry.list()) {
      for (const m of n.runtime.models) nodeModels.add(m);
    }
    const routes = (await db.select().from(modelRoutes)).filter((r) => r.enabled);
    const groups: PlaygroundModelGroup[] = [];

    const ollamaAliases = routes.filter((r) => r.providerType === 'ollama').map((r) => r.alias);
    groups.push({
      id: 'ollama',
      label: 'Local (Ollama)',
      providerType: 'ollama',
      models: [...new Set([...nodeModels, ...ollamaAliases])].sort(),
    });

    // Fetch each provider's live model catalog in parallel (best-effort), then
    // merge with its routed aliases + default model so the picker is populated.
    const providers = app.providers.list();
    const fetched = await Promise.allSettled(providers.map((p) => fetchProviderModels(app, p)));
    providers.forEach((p, i) => {
      const f = fetched[i];
      const live = f.status === 'fulfilled' ? f.value : [];
      const aliases = routes
        .filter((r) => r.providerId === p.id || (r.providerId == null && r.providerType === p.type))
        .map((r) => r.alias);
      const models = [
        ...new Set([...live, ...aliases, ...(p.defaultModel ? [p.defaultModel] : [])]),
      ].sort();
      groups.push({ id: p.id, label: p.name, providerType: p.type, models });
    });

    return reply.send({ groups });
  });
}
