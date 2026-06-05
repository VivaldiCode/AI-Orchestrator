import type {
  AnalyticsQuery,
  AnalyticsSummary,
  BreakdownItem,
  TimeseriesPoint,
} from '@ai-orchestrator/shared';
import { sql } from '../db/client';

const BUCKET_INTERVAL: Record<AnalyticsQuery['bucket'], string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '1h': '1 hour',
  '1d': '1 day',
};

interface SeriesRow {
  bucket: string | Date;
  requests: number;
  errors: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  prompt_tokens: number;
  completion_tokens: number;
}

interface TotalsRow {
  total_requests: number;
  total_errors: number;
  avg_latency: number | null;
  p95_latency: number | null;
  prompt_tokens: number;
  completion_tokens: number;
}

interface BreakdownRow {
  key: string;
  requests: number;
  errors: number;
  avg_latency_ms: number | null;
  total_tokens: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function mapBreakdown(rows: BreakdownRow[]): BreakdownItem[] {
  return rows.map((r) => ({
    key: r.key,
    requests: r.requests,
    errors: r.errors,
    avgLatencyMs: r.avg_latency_ms,
    totalTokens: r.total_tokens,
  }));
}

/**
 * Compute the analytics summary over the requested window. Runs directly
 * against the `request_events` hypertable (TimescaleDB optimises `time_bucket`
 * + percentiles via chunk exclusion).
 */
export async function getAnalytics(query: AnalyticsQuery): Promise<AnalyticsSummary> {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - DAY_MS);
  const interval = BUCKET_INTERVAL[query.bucket] ?? '5 minutes';

  // Shared, parameterised filter fragment (safe from injection). Dates are
  // passed as ISO strings + cast, because the `postgres` driver mis-serializes
  // Date objects when they live inside a nested fragment.
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const where = sql`
    time >= ${fromIso}::timestamptz AND time < ${toIso}::timestamptz
    ${query.nodeId ? sql`AND node_id = ${query.nodeId}` : sql``}
    ${query.model ? sql`AND model = ${query.model}` : sql``}
    ${query.provider ? sql`AND provider = ${query.provider}` : sql``}
  `;

  const seriesRows = await sql<SeriesRow[]>`
    SELECT
      time_bucket(${interval}::interval, time) AS bucket,
      count(*)::int AS requests,
      count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS errors,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::float AS p99,
      coalesce(sum(prompt_tokens), 0)::int AS prompt_tokens,
      coalesce(sum(completion_tokens), 0)::int AS completion_tokens
    FROM request_events
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket
  `;

  const totalsRows = await sql<TotalsRow[]>`
    SELECT
      count(*)::int AS total_requests,
      count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS total_errors,
      avg(latency_ms)::float AS avg_latency,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95_latency,
      coalesce(sum(prompt_tokens), 0)::int AS prompt_tokens,
      coalesce(sum(completion_tokens), 0)::int AS completion_tokens
    FROM request_events
    WHERE ${where}
  `;

  const [byNodeRows, byModelRows, byProviderRows] = await Promise.all([
    sql<BreakdownRow[]>`
      SELECT coalesce(node_id::text, 'unknown') AS key,
        count(*)::int AS requests,
        count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS errors,
        avg(latency_ms)::float AS avg_latency_ms,
        coalesce(sum(total_tokens), 0)::int AS total_tokens
      FROM request_events WHERE ${where}
      GROUP BY node_id ORDER BY requests DESC LIMIT 50
    `,
    sql<BreakdownRow[]>`
      SELECT coalesce(nullif(model, ''), 'unknown') AS key,
        count(*)::int AS requests,
        count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS errors,
        avg(latency_ms)::float AS avg_latency_ms,
        coalesce(sum(total_tokens), 0)::int AS total_tokens
      FROM request_events WHERE ${where}
      GROUP BY model ORDER BY requests DESC LIMIT 50
    `,
    sql<BreakdownRow[]>`
      SELECT provider AS key,
        count(*)::int AS requests,
        count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS errors,
        avg(latency_ms)::float AS avg_latency_ms,
        coalesce(sum(total_tokens), 0)::int AS total_tokens
      FROM request_events WHERE ${where}
      GROUP BY provider ORDER BY requests DESC LIMIT 50
    `,
  ]);

  const totals = totalsRows[0];
  const totalRequests = totals?.total_requests ?? 0;
  const totalErrors = totals?.total_errors ?? 0;

  const series: TimeseriesPoint[] = seriesRows.map((r) => ({
    // time_bucket() may come back as a string (not a Date) from the driver.
    time: new Date(r.bucket).toISOString(),
    requests: r.requests,
    errors: r.errors,
    p50: r.p50,
    p95: r.p95,
    p99: r.p99,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
  }));

  return {
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    avgLatencyMs: totals?.avg_latency ?? null,
    p95LatencyMs: totals?.p95_latency ?? null,
    promptTokens: totals?.prompt_tokens ?? 0,
    completionTokens: totals?.completion_tokens ?? 0,
    byNode: mapBreakdown(byNodeRows),
    byModel: mapBreakdown(byModelRows),
    byProvider: mapBreakdown(byProviderRows),
    series,
  };
}
