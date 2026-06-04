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
  p50: z.number().nullable(),
  p95: z.number().nullable(),
  p99: z.number().nullable(),
  promptTokens: z.number(),
  completionTokens: z.number(),
});
export type TimeseriesPoint = z.infer<typeof timeseriesPointSchema>;

export const breakdownItemSchema = z.object({
  key: z.string(),
  requests: z.number(),
  errors: z.number(),
  avgLatencyMs: z.number().nullable(),
  totalTokens: z.number(),
});
export type BreakdownItem = z.infer<typeof breakdownItemSchema>;

export const analyticsSummarySchema = z.object({
  totalRequests: z.number(),
  totalErrors: z.number(),
  errorRate: z.number(),
  avgLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  byNode: z.array(breakdownItemSchema),
  byModel: z.array(breakdownItemSchema),
  byProvider: z.array(breakdownItemSchema),
  series: z.array(timeseriesPointSchema),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;
