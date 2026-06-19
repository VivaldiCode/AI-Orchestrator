import { z } from 'zod';

/** Time bucket granularity for analytics rollups. */
export const bucketSchema = z.enum(['1m', '5m', '1h', '1d']);
export type Bucket = z.infer<typeof bucketSchema>;

export const analyticsQuerySchema = z.object({
  /** ISO 8601 timestamps; default window is the last 24h. */
  from: z.string().optional(),
  to: z.string().optional(),
  bucket: bucketSchema.default('5m'),
  nodeId: z.uuid().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const timeseriesPointSchema = z.object({
  time: z.string(),
  requests: z.number(),
  errors: z.number(),
  avgLatency: z.number().nullable(),
  minLatency: z.number().nullable(),
  maxLatency: z.number().nullable(),
  p50: z.number().nullable(),
  p95: z.number().nullable(),
  p99: z.number().nullable(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  costUsd: z.number(),
});
export type TimeseriesPoint = z.infer<typeof timeseriesPointSchema>;

/**
 * One time bucket with a per-node request count (`time` plus dynamic node keys),
 * for the stacked "requests by machine" chart. Node keys are node ids (the value
 * `cloud` groups provider/overflow requests that have no node).
 */
export const nodeSeriesPointSchema = z.object({ time: z.string() }).catchall(z.number());
export type NodeSeriesPoint = z.infer<typeof nodeSeriesPointSchema>;

export const breakdownItemSchema = z.object({
  key: z.string(),
  requests: z.number(),
  errors: z.number(),
  avgLatencyMs: z.number().nullable(),
  totalTokens: z.number(),
  costUsd: z.number(),
});
export type BreakdownItem = z.infer<typeof breakdownItemSchema>;

export const analyticsSummarySchema = z.object({
  totalRequests: z.number(),
  totalErrors: z.number(),
  errorRate: z.number(),
  /** Average requests per minute across the window. */
  requestsPerMinute: z.number(),
  avgLatencyMs: z.number().nullable(),
  minLatencyMs: z.number().nullable(),
  maxLatencyMs: z.number().nullable(),
  p50LatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  p99LatencyMs: z.number().nullable(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  avgTokensPerRequest: z.number(),
  totalCostUsd: z.number(),
  byNode: z.array(breakdownItemSchema),
  byModel: z.array(breakdownItemSchema),
  byProvider: z.array(breakdownItemSchema),
  byEndpoint: z.array(breakdownItemSchema),
  series: z.array(timeseriesPointSchema),
  /** Per-bucket request counts split by node (for the stacked machine chart). */
  nodeSeries: z.array(nodeSeriesPointSchema),
  /** The node keys present in `nodeSeries` (node ids, or `cloud`). */
  nodeKeys: z.array(z.string()),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

/** One recorded request, for the Debug view (newest first; errors carry a reason). */
export interface DebugEvent {
  requestId: string;
  at: string;
  endpoint: string;
  /** The model the client asked for. */
  model: string;
  /** The substitute model actually sent upstream (equivalence-chain target), or
   * null when the request ran as-asked. Lets you spot a leaked local name. */
  targetModel: string | null;
  provider: string;
  nodeId: string | null;
  status: number;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  /** Failure reason (e.g. the upstream provider's error text), or null on success. */
  error: string | null;
}
