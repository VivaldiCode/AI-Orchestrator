import { Readable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Settings } from '@ai-orchestrator/shared';
import { config } from '../config/index';
import { logger } from '../lib/logger';
import { nowIso, requestId } from '../lib/ids';
import { badGateway, notFound, serviceUnavailable } from '../lib/errors';
import type { AnalyticsRecorder } from '../analytics/recorder';
import type { RealtimeHub } from '../realtime/hub';
import type { ProviderManager } from '../providers/manager';
import {
  isEmbedEndpoint,
  overflowSupports,
  pickEmbedProvider,
  resolveCloudOverflow,
  resolveEquivalenceChain,
  runEmbedOverflow,
  runOverflowChain,
} from '../providers/overflow';
import type { RequestArchive } from '../archive/index';
import { sanitizeHeaders } from '../archive/index';
import type { NodeRegistry } from './registry';
import { selectNode } from './strategies';
import { nodeBaseUrl, type ManagedNode } from './types';
import {
  buildResponseHeaders,
  extractOllamaUsage,
  filterRequestHeaders,
  modelMatches,
  readCappedWeb,
  readTailWeb,
  safeText,
} from './proxy';

export interface DispatchOptions {
  /** Logical endpoint label for metrics, e.g. `/api/chat`. */
  endpoint: string;
  /** Requested model, used for model-aware routing and analytics. */
  model: string | null;
  /** Authenticated API key id (for per-client analytics), if any. */
  clientKeyId: string | null;
  /** Estimated prompt tokens, for context-window-aware routing (0/undefined = unknown). */
  estimatedTokens?: number;
  /** Originating client IP (for the live-requests view). */
  clientIp?: string | null;
  /** Per-request privacy opt-in: never spill to a cloud provider. */
  localOnly?: boolean;
}

const CONTEXT_MARGIN = 1.15; // headroom over the prompt estimate for the response

function modelAllowed(node: ManagedNode, model: string): boolean {
  const allow = node.enabledModels;
  if (!allow || allow.length === 0) return true;
  return allow.some((m) => modelMatches(m, model));
}

function contextFor(node: ManagedNode, model: string): number | null {
  for (const [name, len] of Object.entries(node.runtime.modelContext)) {
    if (modelMatches(name, model)) return len;
  }
  return null;
}

/**
 * Parse an Ollama `/api/embed` body into a model + normalized input list (its
 * `input` field may be a string or string[]). Returns null when unusable — used
 * by the legacy `/api/embeddings` fallback for older nodes.
 */
export function parseEmbedRequest(
  buf: Buffer | undefined,
): { model: string; inputs: string[] } | null {
  if (!buf || buf.length === 0) return null;
  let body: { model?: unknown; input?: unknown };
  try {
    body = JSON.parse(buf.toString('utf8')) as { model?: unknown; input?: unknown };
  } catch {
    return null;
  }
  const model = typeof body.model === 'string' ? body.model : '';
  if (!model) return null;
  const inputs = Array.isArray(body.input)
    ? body.input.filter((x): x is string => typeof x === 'string')
    : typeof body.input === 'string'
      ? [body.input]
      : [];
  if (inputs.length === 0) return null;
  return { model, inputs };
}

/**
 * Routes Ollama requests to nodes: selects a candidate via the configured
 * strategy, proxies with streaming passthrough, fails over on connection/5xx
 * errors, and records realtime + analytics events.
 */
export class Dispatcher {
  private rrCounter = 0;

  constructor(
    private readonly registry: NodeRegistry,
    private readonly hub: RealtimeHub,
    private readonly recorder: AnalyticsRecorder,
    private readonly getSettings: () => Settings,
    private readonly getProviders: () => ProviderManager | null = () => null,
    private readonly archive?: RequestArchive,
  ) {}

  /** Healthy candidate nodes for an inference request (model-aware + context-aware). */
  candidates(model: string | null, estimatedTokens = 0): ManagedNode[] {
    const settings = this.getSettings();
    let pool = this.registry
      .listEnabled()
      .filter((n) => n.runtime.status === 'up' || n.runtime.status === 'degraded');

    // Per-node model allowlist: if a node restricts its models, honour it.
    if (model) {
      pool = pool.filter((n) => modelAllowed(n, model));
    }

    // Model-aware: prefer nodes that actually report having the model.
    if (model && settings.modelAware) {
      const withModel = pool.filter((n) => n.runtime.models.some((m) => modelMatches(m, model)));
      if (withModel.length > 0) pool = withModel;
    }

    // Context-aware: only nodes whose model context window fits the request. If
    // none fit, fall back to the node(s) with the largest known context, so big
    // calls always go to whoever supports more.
    if (model && settings.contextAware && estimatedTokens > 0) {
      const needed = Math.ceil(estimatedTokens * CONTEXT_MARGIN);
      const fits = pool.filter((n) => {
        const ctx = contextFor(n, model);
        return ctx == null || ctx >= needed; // unknown context → don't over-restrict
      });
      if (fits.length > 0) {
        pool = fits;
      } else {
        const maxCtx = Math.max(...pool.map((n) => contextFor(n, model) ?? 0));
        if (maxCtx > 0) pool = pool.filter((n) => (contextFor(n, model) ?? 0) === maxCtx);
      }
    }

    return pool;
  }

  /**
   * Pick a single node via the configured strategy (model- + context-aware).
   * Used by surfaces that dispatch themselves rather than proxying verbatim —
   * e.g. the Anthropic `/v1/messages` translate path. `exclude` lets the caller
   * fail over to a different node on a subsequent attempt. Advances the
   * round-robin counter so it composes with the rest of the dispatcher.
   */
  pickNode(model: string | null, estimatedTokens = 0, exclude?: Set<string>): ManagedNode | null {
    let pool = this.candidates(model, estimatedTokens);
    if (exclude && exclude.size) pool = pool.filter((n) => !exclude.has(n.id));
    return selectNode(this.getSettings().strategy, pool, this.rrCounter++, estimatedTokens);
  }

  /**
   * Non-streaming single `/api/chat` call to a selected node. Used by the triage
   * agent loop, which needs the full response to inspect/execute tool calls.
   */
  async chatOnce(
    model: string | null,
    body: Record<string, unknown>,
    estimatedTokens = 0,
  ): Promise<Record<string, unknown>> {
    const pool = this.candidates(model, estimatedTokens);
    const node = selectNode(this.getSettings().strategy, pool, this.rrCounter++, estimatedTokens);
    if (!node) throw serviceUnavailable('No healthy nodes available to handle the request.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    this.registry.incInFlight(node.id);
    try {
      const res = await fetch(`${nodeBaseUrl(node)}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, stream: false }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw badGateway(`Node ${node.name} returned ${res.status}.`);
      return (await res.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
      this.registry.decInFlight(node.id);
    }
  }

  /** Load-balanced proxy for inference endpoints (generate/chat/embed). */
  async proxyOllama(
    request: FastifyRequest,
    reply: FastifyReply,
    opts: DispatchOptions,
  ): Promise<void> {
    const settings = this.getSettings();
    const pool = this.candidates(opts.model, opts.estimatedTokens);

    // Cloud overflow / equivalence chain: when the local cluster can't serve the
    // request — every candidate node is saturated, OR no node has the model at
    // all — descend the model's equivalence chain to redirect to the closest
    // model on another provider. Disabled / no usable target → unchanged below.
    // Privacy: a per-request local-only flag or global privacy mode disables it.
    const localOnly = opts.localOnly === true || settings.privacyMode;
    const localUnavailable =
      pool.length === 0 || !pool.some((n) => n.runtime.inFlight < n.maxConcurrency);
    if (!localOnly && overflowSupports(opts.endpoint) && localUnavailable) {
      const pm = this.getProviders();
      if (pm) {
        // An equivalence group is its own opt-in — it redirects regardless of the
        // cloud-overflow toggle. Without a group, fall back to the pinned/first
        // overflow provider's default model only when cloud overflow is enabled.
        let chain = resolveEquivalenceChain(pm, opts.model ?? '');
        if (chain.length === 0 && settings.cloudOverflow) {
          const cloud = resolveCloudOverflow(pm, settings);
          if (cloud) chain = [cloud];
        }
        if (chain.length > 0) {
          await runOverflowChain(
            { providerManager: pm, hub: this.hub, recorder: this.recorder, archive: this.archive },
            request,
            reply,
            opts,
            chain,
          );
          return;
        }
      }
    }

    // Embedding overflow (opt-in): /api/embed + /api/embeddings never use the chat
    // overflow above; when no local node can serve them and embedOverflow is on,
    // translate to a cloud provider's /v1/embeddings instead.
    const tryEmbedOverflow = async (): Promise<boolean> => {
      if (localOnly || !isEmbedEndpoint(opts.endpoint) || !settings.embedOverflow) return false;
      const pm = this.getProviders();
      if (!pm) return false;
      const provider = pickEmbedProvider(pm, settings);
      if (!provider) return false;
      return runEmbedOverflow(
        { provider, providerManager: pm, hub: this.hub, recorder: this.recorder, archive: this.archive },
        request,
        reply,
        opts,
        settings.embedOverflowModel,
      );
    };

    if (pool.length === 0) {
      if (await tryEmbedOverflow()) return;
      throw serviceUnavailable('No healthy nodes available to handle the request.');
    }
    const maxAttempts = Math.min(pool.length, settings.failoverRetries + 1);
    const tried = new Set<string>();
    const deadline = performance.now() + config.requestTimeoutMs;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Reserve a slot on an under-cap node, waiting for one to free rather than
      // overloading a node past its maxConcurrency.
      const node = await this.acquireSlot(pool, tried, opts.estimatedTokens ?? 0, deadline, reply);
      if (!node) break;
      tried.add(node.id);
      const committed = await this.attempt(node, request, reply, opts);
      if (committed) return;
    }
    // Every local node failed (e.g. all 404'd embeddings) → try cloud embed overflow.
    if (await tryEmbedOverflow()) return;
    if (tried.size === 0) {
      throw serviceUnavailable(
        'All nodes are at their concurrency limit; timed out waiting for a free slot.',
      );
    }
    throw badGateway('All candidate nodes failed to handle the request.', { tried: [...tried] });
  }

  /**
   * Reserve a concurrency slot on the best available candidate, treating each
   * node's `maxConcurrency` as a HARD cap. Among under-cap candidates it picks
   * via the configured strategy; when every untried candidate is at capacity it
   * waits for a slot to free (up to `deadline`) instead of overloading a node.
   * Returns null when no untried candidate remains, the deadline passes, or the
   * client disconnected. The returned node has one slot reserved — the caller's
   * attempt() owns the matching release.
   */
  private async acquireSlot(
    pool: ManagedNode[],
    tried: Set<string>,
    estimatedTokens: number,
    deadline: number,
    reply: FastifyReply,
  ): Promise<ManagedNode | null> {
    for (;;) {
      const remaining = pool.filter((n) => !tried.has(n.id));
      if (remaining.length === 0) return null;
      const avail = remaining.filter((n) => n.runtime.inFlight < n.maxConcurrency);
      if (avail.length > 0) {
        const node = selectNode(
          this.getSettings().strategy,
          avail,
          this.rrCounter++,
          estimatedTokens,
        );
        // tryReserve may lose a race to a concurrent request — retry (avail shrinks).
        if (node && this.registry.tryReserve(node.id)) return node;
        continue;
      }
      // Stop waiting if the client hung up. NB: check the RESPONSE socket, not
      // request.raw — request.raw.destroyed is true once the body is read into a
      // buffer, which would (wrongly) abort every queued request immediately.
      const left = deadline - performance.now();
      if (left <= 0 || reply.raw?.destroyed) return null;
      await this.registry.waitForSlot(Math.min(left, 1000));
    }
  }

  /** Returns true when the response was committed to the client (2xx–4xx). */
  private async attempt(
    node: ManagedNode,
    request: FastifyRequest,
    reply: FastifyReply,
    opts: DispatchOptions,
  ): Promise<boolean> {
    const id = requestId();
    const started = performance.now();
    // The concurrency slot was already reserved by acquireSlot() — attempt() owns
    // the matching decInFlight on every exit path (failover, 5xx, or completion).
    this.broadcastStart(id, node.id, opts);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.requestTimeoutMs);
    const body = this.bodyFor(request);
    const target = `${nodeBaseUrl(node)}${request.url}`;

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers: filterRequestHeaders(request.headers),
        body,
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      this.registry.decInFlight(node.id);
      this.registry.recordError(node.id);
      await this.finish(
        id,
        node.id,
        opts,
        502,
        performance.now() - started,
        null,
        null,
        (err as Error).message,
      );
      logger.warn(
        { nodeId: node.id, err: (err as Error).message },
        'upstream fetch failed; failing over',
      );
      return false;
    }

    // Legacy-Ollama fallback: older nodes 404 on the newer /api/embed endpoint.
    // Retry the same node's /api/embeddings (translating the shapes) — stays
    // local. If that also fails, treat it as a node failure and fail over so the
    // caller can try another node or cloud embedding overflow.
    if (upstream.status === 404 && opts.endpoint === '/api/embed') {
      const fb = await this.embedFallback(node, request, ctrl.signal).catch(() => null);
      if (fb) {
        logger.info({ nodeId: node.id }, '/api/embed 404 → fell back to /api/embeddings');
        upstream = fb;
      } else {
        clearTimeout(timer);
        this.registry.decInFlight(node.id);
        this.registry.recordError(node.id);
        await this.finish(
          id,
          node.id,
          opts,
          404,
          performance.now() - started,
          null,
          null,
          'node cannot serve embeddings (/api/embed 404, no /api/embeddings fallback)',
        );
        return false;
      }
    }

    if (upstream.status >= 500) {
      clearTimeout(timer);
      this.registry.decInFlight(node.id);
      this.registry.recordError(node.id);
      const text = await safeText(upstream);
      await this.finish(
        id,
        node.id,
        opts,
        upstream.status,
        performance.now() - started,
        null,
        null,
        text || `upstream ${upstream.status}`,
      );
      logger.warn(
        { nodeId: node.id, status: upstream.status },
        'upstream returned 5xx; failing over',
      );
      return false;
    }

    this.commit(node, request, reply, upstream, ctrl, timer, id, started, opts);
    return true;
  }

  /**
   * Translate a 404'd `/api/embed` into the node's legacy `/api/embeddings` (one
   * call per input) and rebuild an `/api/embed`-shaped response. Returns null if
   * it can't, so the caller surfaces the original 404. Only used as a fallback
   * for older Ollama versions that lack the newer `/api/embed` endpoint.
   */
  private async embedFallback(
    node: ManagedNode,
    request: FastifyRequest,
    signal: AbortSignal,
  ): Promise<Response | null> {
    const parsed = parseEmbedRequest(request.body as Buffer | undefined);
    if (!parsed) return null;
    const base = nodeBaseUrl(node);
    const embeddings: number[][] = [];
    for (const prompt of parsed.inputs) {
      const res = await fetch(`${base}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: parsed.model, prompt }),
        signal,
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { embedding?: unknown };
      if (!Array.isArray(json.embedding) || json.embedding.length === 0) return null;
      embeddings.push(json.embedding as number[]);
    }
    return new Response(JSON.stringify({ model: parsed.model, embeddings }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  /** Proxy to a single (optionally specified) node, e.g. model-management ops. */
  async proxyToNode(
    nodeId: string | null,
    request: FastifyRequest,
    reply: FastifyReply,
    opts: DispatchOptions,
  ): Promise<void> {
    let node = nodeId ? this.registry.get(nodeId) : undefined;
    if (nodeId && !node) throw notFound(`Node ${nodeId} not found.`);
    if (!node) {
      const up = this.registry.listEnabled().filter((n) => n.runtime.status === 'up');
      node = up[0] ?? this.registry.listEnabled()[0];
    }
    if (!node) throw serviceUnavailable('No nodes registered.');

    const id = requestId();
    const started = performance.now();
    this.registry.incInFlight(node.id);
    this.broadcastStart(id, node.id, opts);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.requestTimeoutMs);
    const target = `${nodeBaseUrl(node)}${request.url}`;

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers: filterRequestHeaders(request.headers),
        body: this.bodyFor(request),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      this.registry.decInFlight(node.id);
      this.registry.recordError(node.id);
      await this.finish(
        id,
        node.id,
        opts,
        502,
        performance.now() - started,
        null,
        null,
        (err as Error).message,
      );
      throw badGateway(`Node request failed: ${(err as Error).message}`);
    }

    if (upstream.status >= 500) this.registry.recordError(node.id);
    this.commit(node, request, reply, upstream, ctrl, timer, id, started, opts);
  }

  private commit(
    node: ManagedNode,
    request: FastifyRequest,
    reply: FastifyReply,
    upstream: Response,
    ctrl: AbortController,
    timer: ReturnType<typeof setTimeout>,
    id: string,
    started: number,
    opts: DispatchOptions,
  ): void {
    reply.hijack();
    const res: ServerResponse = reply.raw;
    const outHeaders = buildResponseHeaders(upstream.headers);
    // Expose which node served the request (handy for clients and the smoke test).
    outHeaders['x-orchestrator-node'] = node.id;
    outHeaders['x-orchestrator-node-name'] = node.name;
    res.writeHead(upstream.status, outHeaders);

    const archiveOn = this.archive?.enabled ?? false;

    if (!upstream.body) {
      res.end();
      clearTimeout(timer);
      this.complete(id, node.id, opts, upstream.status, started, null, null);
      if (archiveOn) {
        void this.archiveExchange(
          request,
          node,
          id,
          opts,
          upstream.status,
          started,
          '',
          null,
          null,
        );
      }
      return;
    }

    const [toClient, toParse] = upstream.body.tee();
    const readable = Readable.fromWeb(
      toClient as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    readable.on('error', () => res.end());
    res.on('close', () => ctrl.abort());
    readable.pipe(res);

    void (async () => {
      try {
        // When archiving, read the full (capped) body; otherwise just the tail.
        const body = archiveOn
          ? await readCappedWeb(toParse, this.archive!.maxBytes)
          : await readTailWeb(toParse);
        const usage = extractOllamaUsage(body);
        this.complete(
          id,
          node.id,
          opts,
          upstream.status,
          started,
          usage.promptTokens,
          usage.completionTokens,
        );
        if (archiveOn) {
          void this.archiveExchange(
            request,
            node,
            id,
            opts,
            upstream.status,
            started,
            body,
            usage.promptTokens,
            usage.completionTokens,
          );
        }
      } catch {
        this.complete(id, node.id, opts, upstream.status, started, null, null);
      } finally {
        clearTimeout(timer);
      }
    })();
  }

  /** Persist one node exchange to the request archive (best-effort). */
  private archiveExchange(
    request: FastifyRequest,
    node: ManagedNode | null,
    id: string,
    opts: DispatchOptions,
    status: number,
    started: number,
    responseBody: string,
    promptTokens: number | null,
    completionTokens: number | null,
  ): Promise<void> {
    if (!this.archive) return Promise.resolve();
    return this.archive.record(
      {
        id,
        at: nowIso(),
        method: request.method,
        endpoint: opts.endpoint,
        model: opts.model,
        provider: 'ollama',
        nodeId: node?.id ?? null,
        nodeName: node?.name ?? null,
        clientIp: opts.clientIp ?? null,
        clientKeyId: opts.clientKeyId,
        status,
        latencyMs: Math.round(performance.now() - started),
        promptTokens,
        completionTokens,
        requestHeaders: sanitizeHeaders(request.headers),
      },
      (request.body as Buffer | undefined) ?? null,
      responseBody,
    );
  }

  private complete(
    id: string,
    nodeId: string,
    opts: DispatchOptions,
    status: number,
    started: number,
    promptTokens: number | null,
    completionTokens: number | null,
  ): void {
    this.registry.decInFlight(nodeId);
    this.registry.recordSuccess(nodeId);
    void this.finish(
      id,
      nodeId,
      opts,
      status,
      performance.now() - started,
      promptTokens,
      completionTokens,
      null,
    );
  }

  private async finish(
    id: string,
    nodeId: string | null,
    opts: DispatchOptions,
    status: number,
    latencyMs: number,
    promptTokens: number | null,
    completionTokens: number | null,
    error: string | null,
  ): Promise<void> {
    const latency = Math.round(latencyMs);
    this.hub.broadcast({
      type: 'request:end',
      id,
      nodeId,
      provider: 'ollama',
      model: opts.model ?? '',
      endpoint: opts.endpoint,
      status,
      latencyMs: latency,
      promptTokens,
      completionTokens,
      clientIp: opts.clientIp ?? null,
      at: nowIso(),
    });
    await this.recorder.record({
      requestId: id,
      nodeId,
      provider: 'ollama',
      model: opts.model ?? '',
      endpoint: opts.endpoint,
      status,
      latencyMs: latency,
      promptTokens,
      completionTokens,
      error,
      clientKeyId: opts.clientKeyId,
      clientIp: opts.clientIp ?? null,
    });
  }

  private broadcastStart(id: string, nodeId: string, opts: DispatchOptions): void {
    this.hub.broadcast({
      type: 'request:start',
      id,
      nodeId,
      provider: 'ollama',
      model: opts.model ?? '',
      endpoint: opts.endpoint,
      clientIp: opts.clientIp ?? null,
      at: nowIso(),
    });
  }

  private bodyFor(request: FastifyRequest): Buffer | undefined {
    if (request.method === 'GET' || request.method === 'HEAD') return undefined;
    return request.body as Buffer | undefined;
  }

  /** Merge `/api/tags` across all reachable nodes (union of models by name). */
  async aggregateTags(): Promise<{ models: unknown[] }> {
    const nodes = this.registry.listEnabled().filter((n) => n.runtime.status !== 'down');
    const results = await Promise.allSettled(nodes.map((n) => this.nodeJson(n, '/api/tags')));
    const byName = new Map<string, unknown>();
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const models = (r.value as { models?: { name: string }[] }).models ?? [];
      for (const m of models) {
        if (m && typeof m.name === 'string' && !byName.has(m.name)) byName.set(m.name, m);
      }
    }
    return { models: [...byName.values()] };
  }

  /** Merge `/api/ps` (loaded models) across all up nodes. */
  async aggregatePs(): Promise<{ models: unknown[] }> {
    const nodes = this.registry.listEnabled().filter((n) => n.runtime.status === 'up');
    const results = await Promise.allSettled(nodes.map((n) => this.nodeJson(n, '/api/ps')));
    const byName = new Map<string, unknown>();
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const models = (r.value as { models?: { name: string }[] }).models ?? [];
      for (const m of models) {
        if (m && typeof m.name === 'string') byName.set(m.name, m);
      }
    }
    return { models: [...byName.values()] };
  }

  private async nodeJson(node: ManagedNode, path: string): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.healthcheckTimeoutMs * 2);
    try {
      const res = await fetch(`${nodeBaseUrl(node)}${path}`, { signal: ctrl.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
