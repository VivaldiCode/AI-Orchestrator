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
});
export type NodeRuntime = z.infer<typeof nodeRuntimeSchema>;

/** Node entity merged with its live runtime metrics, as served to the dashboard. */
export const nodeWithRuntimeSchema = nodeSchema.extend({
  runtime: nodeRuntimeSchema,
});
export type NodeWithRuntime = z.infer<typeof nodeWithRuntimeSchema>;
