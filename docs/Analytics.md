# Analytics

Every proxied request is recorded as a row in the `request_events` TimescaleDB hypertable:
timestamp, node, provider, model, endpoint, status, latency, and token counts.

## What you get

- **Totals** — requests, error rate, average and p95 latency
- **Time series** — requests and errors per bucket (`time_bucket`)
- **Percentiles** — p50 / p95 / p99 latency (`percentile_cont`)
- **Breakdowns** — by node, model, and provider

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
