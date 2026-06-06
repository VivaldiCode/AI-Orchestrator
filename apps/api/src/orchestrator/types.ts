import type {
  NodePerf,
  NodeProtocol,
  NodeRuntime,
  NodeStatus,
  SystemStats,
} from '@ai-orchestrator/shared';

/** Mutable, in-memory runtime state tracked per node. */
export interface RuntimeState {
  status: NodeStatus;
  /** Exponentially-weighted moving average of health-check latency (ms). */
  latencyMs: number | null;
  inFlight: number;
  totalRequests: number;
  totalErrors: number;
  models: string[];
  version: string | null;
  lastCheckedAt: string | null;
  consecutiveFailures: number;
  system: SystemStats | null;
  modelContext: Record<string, number>;
  /** Measured inference performance (refreshed periodically from analytics). */
  perf: NodePerf | null;
}

/** A persisted node merged with its live runtime state. */
export interface ManagedNode {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: NodeProtocol;
  weight: number;
  enabled: boolean;
  maxConcurrency: number;
  tags: string[];
  agentPort: number | null;
  enabledModels: string[] | null;
  createdAt: string;
  updatedAt: string;
  runtime: RuntimeState;
}

export function freshRuntime(): RuntimeState {
  return {
    status: 'unknown',
    latencyMs: null,
    inFlight: 0,
    totalRequests: 0,
    totalErrors: 0,
    models: [],
    version: null,
    lastCheckedAt: null,
    consecutiveFailures: 0,
    system: null,
    modelContext: {},
    perf: null,
  };
}

export function nodeBaseUrl(n: Pick<ManagedNode, 'protocol' | 'host' | 'port'>): string {
  return `${n.protocol}://${n.host}:${n.port}`;
}

export function toNodeRuntime(n: ManagedNode): NodeRuntime {
  return {
    id: n.id,
    status: n.runtime.status,
    latencyMs: n.runtime.latencyMs,
    inFlight: n.runtime.inFlight,
    totalRequests: n.runtime.totalRequests,
    totalErrors: n.runtime.totalErrors,
    models: n.runtime.models,
    version: n.runtime.version,
    lastCheckedAt: n.runtime.lastCheckedAt,
    system: n.runtime.system,
    modelContext: n.runtime.modelContext,
    perf: n.runtime.perf,
  };
}
