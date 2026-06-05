import { config } from '../config/index';
import { nowIso } from '../lib/ids';
import { logger } from '../lib/logger';
import type { RealtimeHub } from '../realtime/hub';
import type { NodeRegistry } from './registry';
import { nodeBaseUrl, type ManagedNode } from './types';

interface OllamaTags {
  models?: { name: string }[];
}
interface OllamaVersion {
  version?: string;
}

interface AgentStats {
  cpu?: number;
  cores?: number;
  memUsed?: number;
  memTotal?: number;
  load1?: number | null;
  platform?: string;
  arch?: string;
  uptimeSeconds?: number;
}

/** Periodically pings each enabled node and updates its runtime state. */
export class HealthChecker {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly registry: NodeRegistry,
    private readonly hub: RealtimeHub,
    private readonly intervalMs: number,
    private readonly timeoutMs: number,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.checkAll(), this.intervalMs);
    this.timer.unref?.();
    void this.checkAll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkAll(): Promise<void> {
    const nodes = this.registry.listEnabled();
    await Promise.allSettled(nodes.map((n) => this.checkOne(n)));
    this.hub.broadcast({ type: 'node:metrics', nodes: this.registry.snapshot(), at: nowIso() });
  }

  async checkOne(node: ManagedNode): Promise<void> {
    const base = nodeBaseUrl(node);
    const start = performance.now();
    try {
      const [version, tags] = await Promise.all([
        this.fetchJson<OllamaVersion>(`${base}/api/version`),
        this.fetchJson<OllamaTags>(`${base}/api/tags`),
      ]);
      const latency = performance.now() - start;
      const prev = node.runtime.latencyMs;
      const prevStatus = node.runtime.status;
      node.runtime.latencyMs = Math.round(prev == null ? latency : prev * 0.7 + latency * 0.3);
      node.runtime.models = (tags.models ?? []).map((m) => m.name).filter(Boolean);
      node.runtime.version = version.version ?? node.runtime.version;
      node.runtime.status = 'up';
      node.runtime.consecutiveFailures = 0;
      node.runtime.lastCheckedAt = nowIso();
      if (prevStatus !== 'up') {
        this.hub.broadcast({ type: 'node:status', id: node.id, status: 'up', at: nowIso() });
      }
    } catch (err) {
      const prevStatus = node.runtime.status;
      node.runtime.consecutiveFailures++;
      node.runtime.status = 'down';
      node.runtime.lastCheckedAt = nowIso();
      if (prevStatus !== 'down') {
        logger.warn(
          { nodeId: node.id, host: node.host, err: (err as Error).message },
          'node health check failed',
        );
        this.hub.broadcast({ type: 'node:status', id: node.id, status: 'down', at: nowIso() });
      }
    }

    await this.checkAgent(node);
  }

  /** Best-effort poll of the optional node agent for host CPU/memory. */
  private async checkAgent(node: ManagedNode): Promise<void> {
    if (!node.agentPort) {
      node.runtime.system = null;
      return;
    }
    const url = `http://${node.host}:${node.agentPort}/stats`;
    const headers = config.nodeAgentToken
      ? { authorization: `Bearer ${config.nodeAgentToken}` }
      : undefined;
    try {
      const s = await this.fetchJson<AgentStats>(url, headers);
      node.runtime.system = {
        cpu: typeof s.cpu === 'number' ? s.cpu : null,
        cores: typeof s.cores === 'number' ? s.cores : null,
        memUsed: typeof s.memUsed === 'number' ? s.memUsed : null,
        memTotal: typeof s.memTotal === 'number' ? s.memTotal : null,
        load1: typeof s.load1 === 'number' ? s.load1 : null,
        platform: s.platform ?? null,
        arch: s.arch ?? null,
        uptimeSeconds: typeof s.uptimeSeconds === 'number' ? s.uptimeSeconds : null,
      };
    } catch {
      // agent optional / unreachable — keep the previous value
    }
  }

  private async fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
