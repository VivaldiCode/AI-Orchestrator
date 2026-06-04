import { z } from 'zod';
import { nodeRuntimeSchema, nodeStatusSchema } from './nodes';

/**
 * Events pushed over the dashboard WebSocket. A discriminated union on `type`
 * so the client can switch exhaustively.
 */
export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    nodes: z.array(nodeRuntimeSchema),
    at: z.string(),
  }),
  z.object({
    type: z.literal('node:status'),
    id: z.uuid(),
    status: nodeStatusSchema,
    at: z.string(),
  }),
  z.object({
    type: z.literal('node:metrics'),
    nodes: z.array(nodeRuntimeSchema),
    at: z.string(),
  }),
  z.object({
    type: z.literal('request:start'),
    id: z.string(),
    nodeId: z.uuid().nullable(),
    provider: z.string(),
    model: z.string(),
    endpoint: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal('request:end'),
    id: z.string(),
    nodeId: z.uuid().nullable(),
    provider: z.string(),
    model: z.string(),
    endpoint: z.string(),
    status: z.number(),
    latencyMs: z.number(),
    promptTokens: z.number().nullable(),
    completionTokens: z.number().nullable(),
    at: z.string(),
  }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent['type'];
