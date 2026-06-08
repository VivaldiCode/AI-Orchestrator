import { Readable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index';
import { badGateway, badRequest, forbidden, serviceUnavailable } from '../lib/errors';
import { nowIso, requestId } from '../lib/ids';
import { logger } from '../lib/logger';
import { buildResponseHeaders, readCappedWeb, readTailWeb, safeText } from '../orchestrator/proxy';
import { nodeBaseUrl, type ManagedNode } from '../orchestrator/types';
import { sanitizeHeaders } from '../archive/index';
import { pickOverflowProvider } from '../providers/overflow';
import type { ProviderConfig, ResolvedRoute } from '../providers/types';
import { clientIpOf, clientKeyId, consumeLocalOnly, parseBodyJson } from '../routes/shared';
import {
  AnthropicStreamTranslator,
  anthropicToOpenAI,
  estimateAnthropicTokens,
  extractAnthropicUsage,
  openAIToAnthropic,
} from './translate';

const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ENDPOINT = '/v1/messages';

/** Shared per-request context for the Anthropic Messages surface. */
interface Ctx {
  requested: string;
  body: Record<string, unknown>;
  stream: boolean;
  keyId: string | null;
  ip: string | null;
  inputEstimate: number;
}

/** Map an HTTP status to an Anthropic error `type`. */
function errType(status: number): string {
  if (status === 400) return 'invalid_request_error';
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 404) return 'not_found_error';
  if (status === 429) return 'rate_limit_error';
  return 'api_error';
}

function anthropicError(message: string, status: number): Record<string, unknown> {
  return { type: 'error', error: { type: errType(status), message: message || 'upstream error' } };
}

/**
 * Entry point for `POST /v1/messages` (the Anthropic Messages API that Claude
 * Code speaks). Routes through the full system:
 *  - a model mapped to an Anthropic provider (or an unmapped `claude-*` model
 *    when an Anthropic provider is configured) → passthrough (full fidelity);
 *  - everything else → translate Anthropic⇄OpenAI and dispatch to a local node
 *    (with failover) or, when nodes are saturated, cloud overflow.
 */
export async function runAnthropicMessages(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  routeOverride?: ResolvedRoute,
): Promise<void> {
  const localOnly = consumeLocalOnly(req);
  const body = parseBodyJson(req) ?? {};
  const requested = typeof body.model === 'string' ? body.model : '';
  const settings = app.orchestrator.getSettings();
  const privacy = localOnly || settings.privacyMode;

  // An explicit override (e.g. the playground targeting a chosen provider) skips
  // the alias registry + the claude-* passthrough default.
  let route = routeOverride ?? app.providers.resolve(requested);
  // Friendly default: an unmapped Claude model passes through to a configured
  // Anthropic provider, so Claude Code "just works" once a key is added.
  if (!route && /^claude/i.test(requested)) {
    const anthro = app.providers
      .list()
      .find((c) => c.enabled && c.type === 'anthropic' && c.credentials.apiKey);
    if (anthro) {
      route = { providerType: 'anthropic', targetModel: requested, provider: anthro };
    }
  }

  const ctx: Ctx = {
    requested,
    body,
    stream: body.stream === true,
    keyId: clientKeyId(req),
    ip: clientIpOf(req),
    inputEstimate: estimateAnthropicTokens(body),
  };

  // 1. Anthropic provider → passthrough.
  if (route && route.providerType === 'anthropic') {
    if (privacy) {
      throw forbidden(
        `Privacy: "${requested}" routes to Anthropic (cloud), blocked by local-only/privacy mode.`,
      );
    }
    await passthrough(app, req, reply, ctx, route);
    return;
  }

  // 2. Explicit OpenAI-family cloud mapping → translate to that provider.
  if (route && app.providers.isOpenAIFamily(route.providerType)) {
    if (privacy) {
      throw forbidden(
        `Privacy: "${requested}" routes to a cloud provider, blocked by local-only/privacy mode.`,
      );
    }
    const cfg = route.provider;
    const baseUrl = cfg ? app.providers.baseUrlFor(cfg) : null;
    if (!cfg || !baseUrl || !cfg.credentials.apiKey) {
      throw badRequest(`Provider for "${requested}" is not fully configured.`);
    }
    await callTarget(
      app,
      req,
      reply,
      ctx,
      cloudTarget(cfg, baseUrl, route.targetModel),
      false,
    );
    return;
  }

  // 3. Other adapter-based providers (e.g. bedrock) are not on this surface yet.
  if (route && route.providerType !== 'ollama') {
    throw badRequest(`${route.providerType} is not supported on ${ENDPOINT} yet.`);
  }

  // 4. Default / ollama route → local cluster (translate), overflow when saturated.
  await dispatchToCluster(app, req, reply, ctx, route, privacy, settings.cloudOverflow);
}

/** Local-cluster dispatch with failover, then cloud overflow when saturated. */
async function dispatchToCluster(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  ctx: Ctx,
  route: ResolvedRoute | null,
  privacy: boolean,
  overflowOn: boolean,
): Promise<void> {
  const settings = app.orchestrator.getSettings();
  const dispatcher = app.orchestrator.dispatcher;
  const targetModel = route?.targetModel ?? ctx.requested;
  const pool = dispatcher.candidates(targetModel, ctx.inputEstimate);
  const hasSpare = pool.some((n) => n.runtime.inFlight < n.maxConcurrency);

  const tryOverflow = async (): Promise<boolean> => {
    if (privacy || !overflowOn) return false;
    const provider = pickOverflowProvider(app.providers, settings);
    if (!provider) return false;
    const baseUrl = app.providers.baseUrlFor(provider);
    if (!baseUrl || !provider.defaultModel) return false;
    await callTarget(app, req, reply, ctx, cloudTarget(provider, baseUrl, provider.defaultModel), false);
    return true;
  };

  // Saturated cluster → spill to cloud before queueing on busy nodes.
  if (!hasSpare && (await tryOverflow())) return;

  // Node selection with failover across distinct candidates.
  const tried = new Set<string>();
  const maxAttempts = Math.min(Math.max(pool.length, 1), settings.failoverRetries + 1);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const node = dispatcher.pickNode(targetModel, ctx.inputEstimate, tried);
    if (!node) break;
    tried.add(node.id);
    const result = await callTarget(app, req, reply, ctx, nodeTarget(node, targetModel), true);
    if (result === 'committed') return;
  }

  // No node committed → last-resort overflow, else 503.
  if (await tryOverflow()) return;
  throw serviceUnavailable('No healthy nodes available to handle the request.');
}

interface Target {
  url: string;
  headers: Record<string, string>;
  providerLabel: string;
  targetModel: string;
  nodeId: string | null;
  nodeName: string | null;
}

function nodeTarget(node: ManagedNode, targetModel: string): Target {
  return {
    url: `${nodeBaseUrl(node)}/v1/chat/completions`,
    headers: { 'content-type': 'application/json', accept: '*/*' },
    providerLabel: 'ollama',
    targetModel,
    nodeId: node.id,
    nodeName: node.name,
  };
}

function cloudTarget(cfg: ProviderConfig, baseUrl: string, targetModel: string): Target {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: '*/*' };
  if (cfg.credentials.apiKey) headers.authorization = `Bearer ${cfg.credentials.apiKey}`;
  return {
    url: `${baseUrl}/v1/chat/completions`,
    headers,
    providerLabel: cfg.type,
    targetModel,
    nodeId: null,
    nodeName: cfg.name,
  };
}

/**
 * Translate the Anthropic request to OpenAI chat, call the target, and translate
 * the response back to Anthropic (streaming SSE or a single JSON message).
 * Records realtime + analytics + archive. With `allowRetry`, a pre-stream
 * connection error or 5xx returns `'retry'` (and is NOT committed) so the caller
 * can fail over; otherwise it surfaces the error to the client.
 */
async function callTarget(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  ctx: Ctx,
  t: Target,
  allowRetry: boolean,
): Promise<'committed' | 'retry'> {
  const { payload } = anthropicToOpenAI(ctx.body, t.targetModel);
  const id = requestId();
  const started = performance.now();
  const registry = app.orchestrator.registry;
  const hub = app.orchestrator.hub;
  const recorder = app.orchestrator.recorder;
  const archive = app.archive;
  const archiveOn = archive?.enabled ?? false;

  if (t.nodeId) registry.incInFlight(t.nodeId);
  hub.broadcast({
    type: 'request:start',
    id,
    nodeId: t.nodeId,
    provider: t.providerLabel,
    model: ctx.requested,
    endpoint: ENDPOINT,
    clientIp: ctx.ip,
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
      nodeId: t.nodeId,
      provider: t.providerLabel,
      model: ctx.requested,
      endpoint: ENDPOINT,
      status,
      latencyMs,
      promptTokens,
      completionTokens,
      clientIp: ctx.ip,
      at: nowIso(),
    });
    await recorder.record({
      requestId: id,
      nodeId: t.nodeId,
      provider: t.providerLabel,
      model: ctx.requested,
      endpoint: ENDPOINT,
      status,
      latencyMs,
      promptTokens,
      completionTokens,
      error,
      clientKeyId: ctx.keyId,
    });
  };

  const archiveExchange = (
    status: number,
    responseBody: string,
    promptTokens: number | null,
    completionTokens: number | null,
  ): void => {
    if (!archiveOn || !archive) return;
    void archive.record(
      {
        id,
        at: nowIso(),
        method: req.method,
        endpoint: ENDPOINT,
        model: ctx.requested,
        provider: t.providerLabel,
        nodeId: t.nodeId,
        nodeName: t.nodeName,
        clientIp: ctx.ip,
        clientKeyId: ctx.keyId,
        status,
        latencyMs: Math.round(performance.now() - started),
        promptTokens,
        completionTokens,
        requestHeaders: sanitizeHeaders(req.headers),
      },
      (req.body as Buffer | undefined) ?? null,
      responseBody,
    );
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.requestTimeoutMs);

  let upstream: Response;
  try {
    upstream = await fetch(t.url, {
      method: 'POST',
      headers: t.headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (t.nodeId) {
      registry.decInFlight(t.nodeId);
      registry.recordError(t.nodeId);
    }
    await record(502, null, null, (err as Error).message);
    if (allowRetry) return 'retry';
    throw badGateway(`Upstream request failed: ${(err as Error).message}`);
  }

  // Pre-stream 5xx → fail over (when allowed) instead of surfacing.
  if (upstream.status >= 500 && allowRetry) {
    clearTimeout(timer);
    if (t.nodeId) {
      registry.decInFlight(t.nodeId);
      registry.recordError(t.nodeId);
    }
    const text = await safeText(upstream);
    await record(upstream.status, null, null, text || `upstream ${upstream.status}`);
    return 'retry';
  }

  reply.hijack();
  const res: ServerResponse = reply.raw;
  res.on('close', () => ctrl.abort());

  if (!upstream.ok) {
    if (t.nodeId) {
      registry.decInFlight(t.nodeId);
      if (upstream.status >= 500) registry.recordError(t.nodeId);
    }
    const text = await safeText(upstream);
    clearTimeout(timer);
    res.writeHead(upstream.status, { 'content-type': 'application/json; charset=utf-8' });
    const outText = JSON.stringify(anthropicError(text, upstream.status));
    res.end(outText);
    await record(upstream.status, null, null, text || `upstream ${upstream.status}`);
    archiveExchange(upstream.status, outText, null, null);
    return 'committed';
  }

  const finishNode = (): void => {
    if (!t.nodeId) return;
    registry.decInFlight(t.nodeId);
    registry.recordSuccess(t.nodeId);
  };

  // Expose which node/provider served the request (used by the playground + clients).
  const orchHeaders: Record<string, string> = t.nodeId
    ? { 'x-orchestrator-node': t.nodeId, 'x-orchestrator-node-name': t.nodeName ?? '' }
    : { 'x-orchestrator-provider': t.providerLabel };

  logger.info(
    { provider: t.providerLabel, model: ctx.requested, nodeId: t.nodeId, stream: ctx.stream },
    'anthropic /v1/messages dispatched (translated)',
  );

  // Non-streaming: one JSON message.
  if (!ctx.stream) {
    let json: Record<string, unknown> = {};
    try {
      json = (await upstream.json()) as Record<string, unknown>;
    } catch {
      /* empty */
    }
    clearTimeout(timer);
    const msg = openAIToAnthropic(json, ctx.requested);
    const outText = JSON.stringify(msg);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...orchHeaders });
    res.end(outText);
    const usage = msg.usage as { input_tokens: number; output_tokens: number };
    finishNode();
    await record(200, usage.input_tokens, usage.output_tokens, null);
    archiveExchange(200, outText, usage.input_tokens, usage.output_tokens);
    return 'committed';
  }

  // Streaming: OpenAI SSE → Anthropic SSE events.
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    ...orchHeaders,
  });
  const translator = new AnthropicStreamTranslator(ctx.requested, ctx.inputEstimate);
  const cap = archive?.maxBytes ?? 0;
  let captured = '';
  const keep = (s: string): void => {
    if (archiveOn && (cap === 0 || captured.length < cap)) captured += s;
  };
  try {
    if (upstream.body) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const events = translator.push(decoder.decode(value, { stream: true }));
        if (events) {
          res.write(events);
          keep(events);
        }
      }
    }
    const tail = translator.end();
    res.write(tail);
    keep(tail);
    res.end();
    const usage = translator.tokens;
    finishNode();
    await record(200, usage.input, usage.output, null);
    archiveExchange(200, captured, usage.input, usage.output);
  } catch (err) {
    res.end();
    const usage = translator.tokens;
    finishNode();
    await record(200, usage.input, usage.output, (err as Error).message);
    archiveExchange(200, captured, usage.input, usage.output);
  } finally {
    clearTimeout(timer);
  }
  return 'committed';
}

/**
 * Passthrough to a real Anthropic endpoint: inject the provider's `x-api-key`,
 * forward the version/beta headers, rewrite the model to the route target, and
 * stream the Anthropic response back verbatim (teeing for usage + archive).
 */
async function passthrough(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  ctx: Ctx,
  route: ResolvedRoute,
): Promise<void> {
  const cfg = route.provider;
  const apiKey = cfg?.credentials.apiKey;
  if (!apiKey) throw badRequest('Anthropic API key is not configured for this provider.');
  if (cfg && app.providers.overBudget(cfg)) {
    throw forbidden('Anthropic monthly budget exceeded; request blocked by budget policy.');
  }

  const baseUrl = cfg?.baseUrl || ANTHROPIC_DEFAULT_BASE_URL;
  const reportModel = route.targetModel || ctx.requested;
  const outBody = { ...ctx.body, model: reportModel };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: ctx.stream ? 'text/event-stream' : 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': (req.headers['anthropic-version'] as string) || '2023-06-01',
  };
  if (typeof req.headers['anthropic-beta'] === 'string') {
    headers['anthropic-beta'] = req.headers['anthropic-beta'];
  }

  const hub = app.orchestrator.hub;
  const recorder = app.orchestrator.recorder;
  const archive = app.archive;
  const archiveOn = archive?.enabled ?? false;
  const id = requestId();
  const started = performance.now();

  hub.broadcast({
    type: 'request:start',
    id,
    nodeId: null,
    provider: 'anthropic',
    model: reportModel,
    endpoint: ENDPOINT,
    clientIp: ctx.ip,
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
      provider: 'anthropic',
      model: reportModel,
      endpoint: ENDPOINT,
      status,
      latencyMs,
      promptTokens,
      completionTokens,
      clientIp: ctx.ip,
      at: nowIso(),
    });
    await recorder.record({
      requestId: id,
      nodeId: null,
      provider: 'anthropic',
      model: reportModel,
      endpoint: ENDPOINT,
      status,
      latencyMs,
      promptTokens,
      completionTokens,
      error,
      clientKeyId: ctx.keyId,
    });
  };

  const archiveExchange = (
    status: number,
    responseBody: string,
    promptTokens: number | null,
    completionTokens: number | null,
  ): void => {
    if (!archiveOn || !archive) return;
    void archive.record(
      {
        id,
        at: nowIso(),
        method: req.method,
        endpoint: ENDPOINT,
        model: reportModel,
        provider: 'anthropic',
        nodeId: null,
        nodeName: cfg?.name ?? 'anthropic',
        clientIp: ctx.ip,
        clientKeyId: ctx.keyId,
        status,
        latencyMs: Math.round(performance.now() - started),
        promptTokens,
        completionTokens,
        requestHeaders: sanitizeHeaders(req.headers),
      },
      (req.body as Buffer | undefined) ?? null,
      responseBody,
    );
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.requestTimeoutMs);

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(outBody),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    await record(502, null, null, (err as Error).message);
    throw badGateway(`Anthropic request failed: ${(err as Error).message}`);
  }

  reply.hijack();
  const res: ServerResponse = reply.raw;
  res.on('close', () => ctrl.abort());

  const outHeaders = buildResponseHeaders(upstream.headers);
  outHeaders['x-orchestrator-provider'] = cfg?.name ?? 'anthropic';
  res.writeHead(upstream.status, outHeaders);

  if (!upstream.body) {
    res.end();
    clearTimeout(timer);
    await record(upstream.status, null, null, upstream.ok ? null : `upstream ${upstream.status}`);
    return;
  }

  const [toClient, toParse] = upstream.body.tee();
  const readable = Readable.fromWeb(toClient as unknown as Parameters<typeof Readable.fromWeb>[0]);
  readable.on('error', () => res.end());
  readable.pipe(res);

  void (async () => {
    try {
      const text = archiveOn
        ? await readCappedWeb(toParse, archive!.maxBytes)
        : await readTailWeb(toParse);
      const usage = extractAnthropicUsage(text);
      await record(
        upstream.status,
        usage.promptTokens,
        usage.completionTokens,
        upstream.ok ? null : `upstream ${upstream.status}`,
      );
      archiveExchange(upstream.status, text, usage.promptTokens, usage.completionTokens);
    } catch {
      await record(upstream.status, null, null, null);
    } finally {
      clearTimeout(timer);
    }
  })();
}
