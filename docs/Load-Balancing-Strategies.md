# Load-Balancing Strategies

The strategy decides which healthy node handles each inference request. Change it live on the
dashboard **Settings** page, or set the initial value with `DEFAULT_STRATEGY`.

| Strategy            | Behaviour                                                                       | Good for                       |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| `round-robin`       | Rotate evenly across nodes (stable order).                                      | Homogeneous machines           |
| `least-connections` | Fewest in-flight requests wins.                                                 | Mixed request sizes (default)  |
| `least-latency`     | Lowest recent health-check latency wins.                                        | Machines with different speeds |
| `weighted`          | Minimise `inFlight / weight` — higher-weight machines take proportionally more. | Heterogeneous hardware         |

All strategies are **deterministic** (ties broken by node id), which keeps them predictable and
easy to test (`apps/api/src/orchestrator/strategies.ts`).

## Model-aware routing

When **model-aware** is on (default), only nodes that report having the requested model are
considered. If none have it, the orchestrator falls back to the full healthy pool (so a
subsequent `pull` can place it). Toggle on the Settings page.

## Context-aware routing

When **context-aware** is on (default), the orchestrator estimates the prompt size of each
request (~4 characters per token, see `apps/api/src/orchestrator/tokens.ts`) and only routes to
nodes whose model context window can hold it (with a small safety margin). The context length of
each model is discovered automatically during health checks via Ollama's `POST /api/show`
(`model_info."<arch>.context_length"`), and shown per model on the **Nodes** page.

If no eligible node fits a very large request, the call is sent to the node(s) with the **largest**
context window rather than being dropped — so big calls always land where they have the best
chance. Toggle on the Settings page.

## Per-node model selection

Each node has an optional **model allowlist** (`enabledModels`). When set, only the listed models
are eligible for routing to that node; when empty, the node serves any model it has. Edit it on the
**Nodes** page (the _Models_ button) — useful to pin small models to weaker Macs and reserve large
ones for machines with more RAM/VRAM.

## Failover

If the chosen node refuses the connection or returns a 5xx **before any response bytes are
sent**, the dispatcher transparently retries another node, up to `failoverRetries` times. Once
streaming has begun, the response is committed to that node.

## Health & status

Each node is pinged every `HEALTHCHECK_INTERVAL_MS` (`GET /api/version` + `/api/tags`):

- **up** — reachable; models and latency refreshed
- **degraded** — a live request failed but health checks still pass
- **down** — health check failed
- **unknown** — not yet checked

Only `up`/`degraded` nodes receive traffic.
