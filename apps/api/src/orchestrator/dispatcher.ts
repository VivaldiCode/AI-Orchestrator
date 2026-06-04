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
import type { NodeRegistry } from './registry';
import { selectNode } from './strategies';
import { nodeBaseUrl, type ManagedNode } from './types';
import {
  buildResponseHeaders,
  extractOllamaUsage,
  filterRequestHeaders,
  modelMatches,
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
  ) {}

  /** Healthy candidate nodes for an inference request (model-aware if enabled). */
  candidates(model: string | null): ManagedNode[] {
    const settings = this.getSettings();
    let pool = this.registry
      .listEnabled()
      .filter((n) => n.runtime.status === 'up' || n.runtime.status === 'degraded');
    if (model && settings.modelAware) {
      const withModel = pool.filter((n) => n.runtime.models.some((m) => modelMatches(m, model)));
      if (withModel.length > 0) pool = withModel;
    }
    return pool;
  }

  /** Load-balanced proxy for inference endpoints (generate/chat/embed). */
  async proxyOllama(
    request: FastifyRequest,
    reply: FastifyReply,
    opts: DispatchOptions,
  ): Promise<void> {
    const settings = this.getSettings();
    const pool = this.candidates(opts.model);
    if (pool.length === 0) {
      throw serviceUnavailable('No healthy nodes available to handle the request.');
    }
    const maxAttempts = Math.min(pool.length, settings.failoverRetries + 1);
    const tried = new Set<string>();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const remaining = pool.filter((n) => !tried.has(n.id));
      const node = selectNode(settings.strategy, remaining, this.rrCounter++);
      if (!node) break;
      tried.add(node.id);
      const committed = await this.attempt(node, request, reply, opts);
      if (committed) return;
    }
    throw badGateway('All candidate nodes failed to handle the request.', { tried: [...tried] });
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
    this.registry.incInFlight(node.id);
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

    this.commit(node, reply, upstream, ctrl, timer, id, started, opts);
    return true;
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
    this.commit(node, reply, upstream, ctrl, timer, id, started, opts);
  }

  private commit(
    node: ManagedNode,
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
    res.writeHead(upstream.status, buildResponseHeaders(upstream.headers));

    if (!upstream.body) {
      res.end();
      clearTimeout(timer);
      this.complete(id, node.id, opts, upstream.status, started, null, null);
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
        const tail = await readTailWeb(toParse);
        const usage = extractOllamaUsage(tail);
        this.complete(
          id,
          node.id,
          opts,
          upstream.status,
          started,
          usage.promptTokens,
          usage.completionTokens,
        );
      } catch {
        this.complete(id, node.id, opts, upstream.status, started, null, null);
      } finally {
        clearTimeout(timer);
      }
    })();
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
