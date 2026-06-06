import { z } from 'zod';

/** Live health state of a node. */
export const nodeStatusSchema = z.enum(['up', 'degraded', 'down', 'unknown']);
export type NodeStatus = z.infer<typeof nodeStatusSchema>;

export const nodeProtocolSchema = z.enum(['http', 'https']);
export type NodeProtocol = z.infer<typeof nodeProtocolSchema>;

/** Raw field validators, reused by create/update schemas. */
const nodeFields = {
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  protocol: nodeProtocolSchema,
  weight: z.number().int().min(1).max(1000),
  enabled: z.boolean(),
  maxConcurrency: z.number().int().min(1).max(1024),
  tags: z.array(z.string().min(1).max(40)).max(20),
  /** Optional port of the node agent (system metrics bridge); null = disabled. */
  agentPort: z.number().int().min(1).max(65535).nullable(),
  /** Allowlist of models this node serves; null/empty = all available models. */
  enabledModels: z.array(z.string().min(1).max(200)).nullable(),
};

/** Payload to register a new Ollama node (a Mac). */
export const createNodeSchema = z.object({
  ...nodeFields,
  port: nodeFields.port.default(11434),
  protocol: nodeFields.protocol.default('http'),
  weight: nodeFields.weight.default(1),
  enabled: nodeFields.enabled.default(true),
  maxConcurrency: nodeFields.maxConcurrency.default(4),
  tags: nodeFields.tags.default([]),
  agentPort: nodeFields.agentPort.default(null),
  enabledModels: nodeFields.enabledModels.default(null),
});
export type CreateNodeInput = z.infer<typeof createNodeSchema>;

/** Partial payload to update a node (PATCH semantics, no defaults applied). */
export const updateNodeSchema = z.object(nodeFields).partial();
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;

/** Persisted node entity. */
export const nodeSchema = z.object({
  ...nodeFields,
  id: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Node = z.infer<typeof nodeSchema>;

/** Live, in-memory runtime metrics for a node (not persisted as-is). */
/** Host system metrics reported by the optional node agent. */
export const systemStatsSchema = z.object({
  cpu: z.number().min(0).max(1).nullable(),
  cores: z.number().int().nonnegative().nullable(),
  memUsed: z.number().nonnegative().nullable(),
  memTotal: z.number().nonnegative().nullable(),
  load1: z.number().nonnegative().nullable(),
  platform: z.string().nullable(),
  arch: z.string().nullable(),
  uptimeSeconds: z.number().nonnegative().nullable(),
});
export type SystemStats = z.infer<typeof systemStatsSchema>;

/**
 * Measured inference performance over a recent window (from analytics), used by
 * the performance-aware load-balancing strategy. Null fields = not enough data.
 */
export const nodePerfSchema = z.object({
  /** Number of completed requests in the window that fed these stats. */
  samples: z.number().int().nonnegative(),
  /** Average full-request completion time (ms). */
  avgLatencyMs: z.number().nonnegative().nullable(),
  /** Effective throughput: total tokens ÷ total processing time. */
  tokensPerSecond: z.number().nonnegative().nullable(),
  /** Inverse throughput (ms of processing per token) — the routing cost factor. */
  msPerToken: z.number().nonnegative().nullable(),
  /** Look-back window these stats were computed over (hours). */
  windowHours: z.number().positive(),
});
export type NodePerf = z.infer<typeof nodePerfSchema>;

export const nodeRuntimeSchema = z.object({
  id: z.uuid(),
  status: nodeStatusSchema,
  latencyMs: z.number().nonnegative().nullable(),
  inFlight: z.number().int().nonnegative(),
  totalRequests: z.number().int().nonnegative(),
  totalErrors: z.number().int().nonnegative(),
  models: z.array(z.string()),
  version: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  /** Host CPU/memory from the node agent, or null when no agent is configured. */
  system: systemStatsSchema.nullable(),
  /** Discovered context window (max tokens) per model name. */
  modelContext: z.record(z.string(), z.number()),
  /** Measured inference performance (24h), or null until enough samples exist. */
  perf: nodePerfSchema.nullable(),
});
export type NodeRuntime = z.infer<typeof nodeRuntimeSchema>;

/** Node entity merged with its live runtime metrics, as served to the dashboard. */
export const nodeWithRuntimeSchema = nodeSchema.extend({
  runtime: nodeRuntimeSchema,
});
export type NodeWithRuntime = z.infer<typeof nodeWithRuntimeSchema>;
