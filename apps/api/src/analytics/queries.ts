import type {
  AnalyticsQuery,
  AnalyticsSummary,
  BreakdownItem,
  DebugEvent,
  NodePerf,
  NodeSeriesPoint,
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
  avg_latency: number | null;
  min_latency: number | null;
  max_latency: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

interface TotalsRow {
  total_requests: number;
  total_errors: number;
  avg_latency: number | null;
  min_latency: number | null;
  max_latency: number | null;
  p50_latency: number | null;
  p95_latency: number | null;
  p99_latency: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

interface BreakdownRow {
  key: string;
  requests: number;
  errors: number;
  avg_latency_ms: number | null;
  total_tokens: number;
  cost_usd: number;
}

interface NodeSeriesRow {
  bucket: string | Date;
  node: string;
  requests: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function mapBreakdown(rows: BreakdownRow[]): BreakdownItem[] {
  return rows.map((r) => ({
    key: r.key,
    requests: r.requests,
    errors: r.errors,
    avgLatencyMs: r.avg_latency_ms,
    totalTokens: r.total_tokens,
    costUsd: r.cost_usd,
  }));
}

/** Month-to-date spend (USD) per provider — for budget enforcement. */
export async function getProviderSpend(monthStartIso: string): Promise<Map<string, number>> {
  const rows = await sql<{ provider: string; cost: number }[]>`
    SELECT provider, coalesce(sum(cost_usd), 0)::float AS cost
    FROM request_events
    WHERE time >= ${monthStartIso}::timestamptz
    GROUP BY provider
  `;
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.provider, r.cost);
  return map;
}

/**
 * Pivot per-(bucket,node) rows into stacked-chart points: one row per time
 * bucket with a numeric column per node (missing nodes filled with 0 so the
 * stacked areas don't gap). Pure + exported for unit testing.
 */
export function pivotNodeSeries(rows: NodeSeriesRow[]): {
  points: NodeSeriesPoint[];
  keys: string[];
} {
  const keys = new Set<string>();
  const byTime = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const time = new Date(r.bucket).toISOString();
    keys.add(r.node);
    const row = byTime.get(time) ?? {};
    row[r.node] = (row[r.node] ?? 0) + r.requests;
    byTime.set(time, row);
  }
  const keyList = [...keys].sort();
  const points: NodeSeriesPoint[] = [...byTime.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([time, counts]) => {
      const point: Record<string, number | string> = { time };
      for (const k of keyList) point[k] = counts[k] ?? 0;
      return point as NodeSeriesPoint;
    });
  return { points, keys: keyList };
}

interface NodePerfRow {
  node: string;
  samples: number;
  avg_latency: number | null;
  total_tokens: number;
  total_latency_ms: number;
}

/**
 * Per-node measured inference performance over the last `windowHours`, used by
 * the performance-aware routing strategy. Throughput is total tokens ÷ total
 * processing time; `msPerToken` is its inverse (the routing cost factor). Only
 * successful, timed requests count.
 */
export async function getNodePerformance(windowHours = 24): Promise<Map<string, NodePerf>> {
  const rows = await sql<NodePerfRow[]>`
    SELECT node_id::text AS node,
      count(*)::int AS samples,
      avg(latency_ms)::float AS avg_latency,
      coalesce(sum(total_tokens), 0)::float AS total_tokens,
      coalesce(sum(latency_ms), 0)::float AS total_latency_ms
    FROM request_events
    WHERE node_id IS NOT NULL
      AND time >= now() - make_interval(hours => ${windowHours}::int)
      AND status < 400
      AND latency_ms IS NOT NULL AND latency_ms > 0
    GROUP BY node_id
  `;
  const map = new Map<string, NodePerf>();
  for (const r of rows) {
    const seconds = r.total_latency_ms / 1000;
    const tokensPerSecond = seconds > 0 && r.total_tokens > 0 ? r.total_tokens / seconds : null;
    const msPerToken = r.total_tokens > 0 ? r.total_latency_ms / r.total_tokens : null;
    map.set(r.node, {
      samples: r.samples,
      avgLatencyMs: r.avg_latency,
      tokensPerSecond,
      msPerToken,
      windowHours,
    });
  }
  return map;
}

/** Recent request rows for the Debug view (newest first). */
export async function getRecentEvents(opts: {
  limit: number;
  onlyErrors?: boolean;
  provider?: string;
  ip?: string;
  endpoint?: string;
  model?: string;
  nodeId?: string;
  status?: number;
}): Promise<DebugEvent[]> {
  const rows = await sql<
    {
      request_id: string;
      time: Date;
      endpoint: string;
      model: string;
      target_model: string | null;
      provider: string;
      node_id: string | null;
      node_name: string | null;
      client_ip: string | null;
      status: number;
      latency_ms: number | null;
      prompt_tokens: number | null;
      completion_tokens: number | null;
      error: string | null;
    }[]
  >`
    SELECT re.request_id, re.time, re.endpoint, re.model, re.target_model, re.provider,
           re.node_id::text AS node_id, n.name AS node_name, re.client_ip,
           re.status, re.latency_ms, re.prompt_tokens, re.completion_tokens, re.error
    FROM request_events re
    LEFT JOIN nodes n ON n.id = re.node_id
    WHERE TRUE
      ${opts.onlyErrors ? sql`AND (re.status >= 400 OR re.error IS NOT NULL)` : sql``}
      ${opts.provider ? sql`AND re.provider = ${opts.provider}` : sql``}
      ${opts.ip ? sql`AND re.client_ip = ${opts.ip}` : sql``}
      ${opts.endpoint ? sql`AND re.endpoint = ${opts.endpoint}` : sql``}
      ${opts.model ? sql`AND re.model = ${opts.model}` : sql``}
      ${opts.nodeId ? sql`AND re.node_id = ${opts.nodeId}::uuid` : sql``}
      ${opts.status != null ? sql`AND re.status = ${opts.status}` : sql``}
    ORDER BY re.time DESC
    LIMIT ${Math.min(Math.max(opts.limit, 1), 500)}
  `;
  return rows.map((r) => ({
    requestId: r.request_id,
    at: new Date(r.time).toISOString(),
    endpoint: r.endpoint,
    model: r.model,
    targetModel: r.target_model,
    provider: r.provider,
    nodeId: r.node_id,
    nodeName: r.node_name,
    clientIp: r.client_ip,
    status: r.status,
    latencyMs: r.latency_ms,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    error: r.error,
  }));
}

export interface ProviderPerf {
  requests: number;
  avgLatencyMs: number | null;
  tokensPerSecond: number | null;
  models: number;
}

/** Per-provider performance over a recent window (24h default), keyed by provider type. */
export async function getProviderPerformance(windowHours = 24): Promise<Map<string, ProviderPerf>> {
  const rows = await sql<
    {
      provider: string;
      requests: number;
      avg_latency: number | null;
      total_tokens: number;
      total_latency_ms: number;
      models: number;
    }[]
  >`
    SELECT provider,
      count(*)::int AS requests,
      avg(latency_ms)::float AS avg_latency,
      coalesce(sum(total_tokens), 0)::float AS total_tokens,
      coalesce(sum(latency_ms), 0)::float AS total_latency_ms,
      count(DISTINCT model)::int AS models
    FROM request_events
    WHERE time >= now() - make_interval(hours => ${windowHours}::int)
    GROUP BY provider
  `;
  const map = new Map<string, ProviderPerf>();
  for (const r of rows) {
    const seconds = r.total_latency_ms / 1000;
    map.set(r.provider, {
      requests: r.requests,
      avgLatencyMs: r.avg_latency,
      tokensPerSecond: seconds > 0 && r.total_tokens > 0 ? r.total_tokens / seconds : null,
      models: r.models,
    });
  }
  return map;
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
      avg(latency_ms)::float AS avg_latency,
      min(latency_ms)::float AS min_latency,
      max(latency_ms)::float AS max_latency,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::float AS p99,
      coalesce(sum(prompt_tokens), 0)::int AS prompt_tokens,
      coalesce(sum(completion_tokens), 0)::int AS completion_tokens,
      coalesce(sum(total_tokens), 0)::int AS total_tokens,
      coalesce(sum(cost_usd), 0)::float AS cost_usd
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
      min(latency_ms)::float AS min_latency,
      max(latency_ms)::float AS max_latency,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50_latency,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95_latency,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::float AS p99_latency,
      coalesce(sum(prompt_tokens), 0)::int AS prompt_tokens,
      coalesce(sum(completion_tokens), 0)::int AS completion_tokens,
      coalesce(sum(total_tokens), 0)::int AS total_tokens,
      coalesce(sum(cost_usd), 0)::float AS cost_usd
    FROM request_events
    WHERE ${where}
  `;

  const [byNodeRows, byModelRows, byProviderRows, byEndpointRows, nodeSeriesRows] =
    await Promise.all([
      sql<BreakdownRow[]>`
        SELECT coalesce(node_id::text, 'cloud') AS key,
          count(*)::int AS requests,
          count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS errors,
          avg(latency_ms)::float AS avg_latency_ms,
          coalesce(sum(total_tokens), 0)::int AS total_tokens,
          coalesce(sum(cost_usd), 0)::float AS cost_usd
        FROM request_events WHERE ${where}
        GROUP BY key ORDER BY requests DESC LIMIT 50
      `,
      sql<BreakdownRow[]>`
        SELECT coalesce(nullif(model, ''), 'unknown') AS key,
          count(*)::int AS requests,
          count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS errors,
          avg(latency_ms)::float AS avg_latency_ms,
          coalesce(sum(total_tokens), 0)::int AS total_tokens,
          coalesce(sum(cost_usd), 0)::float AS cost_usd
        FROM request_events WHERE ${where}
        GROUP BY key ORDER BY requests DESC LIMIT 50
      `,
      sql<BreakdownRow[]>`
        SELECT provider AS key,
          count(*)::int AS requests,
          count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS errors,
          avg(latency_ms)::float AS avg_latency_ms,
          coalesce(sum(total_tokens), 0)::int AS total_tokens,
          coalesce(sum(cost_usd), 0)::float AS cost_usd
        FROM request_events WHERE ${where}
        GROUP BY key ORDER BY requests DESC LIMIT 50
      `,
      sql<BreakdownRow[]>`
        SELECT coalesce(nullif(endpoint, ''), 'unknown') AS key,
          count(*)::int AS requests,
          count(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int AS errors,
          avg(latency_ms)::float AS avg_latency_ms,
          coalesce(sum(total_tokens), 0)::int AS total_tokens,
          coalesce(sum(cost_usd), 0)::float AS cost_usd
        FROM request_events WHERE ${where}
        GROUP BY key ORDER BY requests DESC LIMIT 50
      `,
      sql<NodeSeriesRow[]>`
        SELECT time_bucket(${interval}::interval, time) AS bucket,
          coalesce(node_id::text, 'cloud') AS node,
          count(*)::int AS requests
        FROM request_events WHERE ${where}
        GROUP BY bucket, node ORDER BY bucket
      `,
    ]);

  const totals = totalsRows[0];
  const totalRequests = totals?.total_requests ?? 0;
  const totalErrors = totals?.total_errors ?? 0;
  const totalTokens = totals?.total_tokens ?? 0;
  const windowMinutes = Math.max(1, (to.getTime() - from.getTime()) / 60000);

  const series: TimeseriesPoint[] = seriesRows.map((r) => ({
    // time_bucket() may come back as a string (not a Date) from the driver.
    time: new Date(r.bucket).toISOString(),
    requests: r.requests,
    errors: r.errors,
    avgLatency: r.avg_latency,
    minLatency: r.min_latency,
    maxLatency: r.max_latency,
    p50: r.p50,
    p95: r.p95,
    p99: r.p99,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    totalTokens: r.total_tokens,
    costUsd: r.cost_usd,
  }));

  const { points: nodeSeries, keys: nodeKeys } = pivotNodeSeries(nodeSeriesRows);

  return {
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    requestsPerMinute: totalRequests / windowMinutes,
    avgLatencyMs: totals?.avg_latency ?? null,
    minLatencyMs: totals?.min_latency ?? null,
    maxLatencyMs: totals?.max_latency ?? null,
    p50LatencyMs: totals?.p50_latency ?? null,
    p95LatencyMs: totals?.p95_latency ?? null,
    p99LatencyMs: totals?.p99_latency ?? null,
    promptTokens: totals?.prompt_tokens ?? 0,
    completionTokens: totals?.completion_tokens ?? 0,
    totalTokens,
    avgTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
    totalCostUsd: totals?.cost_usd ?? 0,
    byNode: mapBreakdown(byNodeRows),
    byModel: mapBreakdown(byModelRows),
    byProvider: mapBreakdown(byProviderRows),
    byEndpoint: mapBreakdown(byEndpointRows),
    series,
    nodeSeries,
    nodeKeys,
  };
}

/**
 * Cyclic retention: keep only the newest `max` rows in `request_events`,
 * deleting older ones. No-op when `max` is 0 or there are fewer rows than `max`
 * (the cutoff subquery returns NULL → nothing matches `time < NULL`).
 */
export async function trimRequestEvents(max: number): Promise<void> {
  if (!max || max <= 0) return;
  await sql`
    DELETE FROM request_events
    WHERE time < (SELECT time FROM request_events ORDER BY time DESC OFFSET ${max} LIMIT 1)
  `;
}
