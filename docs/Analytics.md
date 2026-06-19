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

## Overview providers panel

The dashboard **Overview** shows your active **providers** next to the nodes — each card with live
**in-flight** calls (derived from realtime start/end events, per provider), **24h average latency**,
**distinct models** served in 24h, and **24h speed** (tokens/s). Backed by
`GET /admin/providers/metrics`.

## Debug view

The dashboard **Debug** page lists recent requests newest-first, with an **Errors only** toggle. Each
row shows the endpoint, model, provider/node, status and latency; failed rows also show the **error
reason** — for a cloud provider that's the **upstream error text** (e.g. `upstream 404: the model
"gemma4:26b" does not exist`), which usually pinpoints a wrong substitute-model name, a bad API key,
or an over-budget/expired provider. Expand a row to see the raw **request and response bodies** (when
the request archive is enabled). Backed by `GET /admin/debug/events?errors=1`.

## Performance

Queries run directly against the hypertable; TimescaleDB prunes chunks by time range. For very
large, long-retention deployments, continuous aggregates and retention policies are on the
[Roadmap](Roadmap.md).
