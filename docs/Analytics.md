# Analytics

Every proxied request is recorded as a row in the `request_events` TimescaleDB hypertable:
timestamp, node, provider, model, endpoint, status, latency, and token counts.

## What you get

- **Totals** — requests, throughput (req/min), error rate, total tokens (+ avg per request), and
  latency **average / min / max / p50 / p95 / p99**.
- **Charts over time** (`time_bucket`), ranges 1h / 24h / 7d / 30d:
  - **Requests & errors** per bucket
  - **Latency** (avg · p50 · p95 · p99) via `percentile_cont`
  - **Token usage** (prompt + completion, stacked)
  - **Requests by machine** — per-node request counts stacked over time, so you can see how the
    fleet shares load through the day
- **Breakdowns / allocation** — share of requests **by node, model, provider, and endpoint** with
  a percentage bar. Node rows show the node name; provider/overflow requests (no node) group under
  `cloud`.
- **Live** — the Analytics page auto-refreshes every 5s; the Overview **Live requests** feed shows
  each call in real time with its timestamp, client IP, and token counts.

## Querying

Dashboard → **Analytics**, or the API:

```bash
curl "http://localhost:11435/admin/analytics?bucket=5m&from=2026-06-01T00:00:00Z" \
  -H "authorization: Bearer <admin-jwt>"
```

Parameters: `from`, `to` (ISO 8601), `bucket` (`1m`/`5m`/`1h`/`1d`), and optional `nodeId`,
`model`, `provider` filters.

## Performance

Queries run directly against the hypertable; TimescaleDB prunes chunks by time range. For very
large, long-retention deployments, continuous aggregates and retention policies are on the
[Roadmap](Roadmap.md).
