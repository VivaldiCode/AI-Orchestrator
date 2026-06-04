# Dashboard Guide

The dashboard (React + Vite) is the control panel for your fleet.

## Pages

- **Overview** — live node cards (status, in-flight, latency, models), fleet totals, and a
  real-time request feed (over WebSocket).
- **Nodes** — add/edit/enable/disable/delete Macs and run connectivity tests.
- **Providers** — add cloud providers; credentials are write-only and encrypted at rest.
- **Analytics** — throughput, latency percentiles, error rate, and breakdowns by node / model /
  provider, with a configurable time range.
- **API Keys** — issue and revoke inference keys (the secret is shown only once).
- **Settings** — pick the load-balancing strategy, toggle model-aware routing and auto-pull,
  and set failover retries.

## Realtime

The header/sidebar shows a **Live / Offline** indicator. The dashboard subscribes to `/ws` and
updates node metrics and the request feed without polling.

## First run

On first load you'll be asked to **create an admin account**. After that you log in with those
credentials; tokens are stored in the browser and refreshed automatically.
