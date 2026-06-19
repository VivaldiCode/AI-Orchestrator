# Load-Balancing Strategies

The strategy decides which healthy node handles each inference request. Change it live on the
dashboard **Settings** page, or set the initial value with `DEFAULT_STRATEGY`.

| Strategy            | Behaviour                                                                       | Good for                          |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------- |
| `round-robin`       | Rotate evenly across nodes (stable order).                                      | Homogeneous machines              |
| `least-connections` | Fewest in-flight requests wins.                                                 | Mixed request sizes (default)     |
| `least-latency`     | Lowest recent health-check latency wins.                                        | Machines with different speeds    |
| `weighted`          | Minimise `inFlight / weight` — higher-weight machines take proportionally more. | Heterogeneous hardware            |
| `performance`       | Predicted completion time from **measured 24h speed** + current load.           | Mixed-speed fleets (M5/M3 Max/M3) |

All strategies are **deterministic** (ties broken by node id), which keeps them predictable and
easy to test (`apps/api/src/orchestrator/strategies.ts`).

## Performance-aware routing (mixed fleets)

`performance` compensates for machines of different speeds (e.g. an M5 next to an M3 Max and an
M3). Every minute the orchestrator recomputes, per node, from the **last 24h** of `request_events`:

- **ms/token** — total processing time ÷ total tokens (the per-token cost),
- **tokens/sec** — its inverse (shown on the Overview as each node's live speed),
- **avg completion time** — the typical full-request duration.

Each request is then routed to the node with the lowest **predicted completion time**:

```
score(node) = inFlight · avgCompletionTime      (clear the current backlog)
            + estimatedTokens · msPerToken       (generate this request)
```

So **large prompts gravitate to the fastest machine**, while **small or unknown-size requests are
balanced by load**. A node with no history yet borrows the fleet average, so it still receives
traffic and gets sampled. Token estimates come from the same estimator as context-aware routing
(~4 chars/token). Stats refresh every 60s over a 24h window.

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

## Cloud overflow (spillover)

A node's **max concurrency** also acts as its capacity gate for overflow: when _every_ candidate
node is at or above its max concurrency (or none are healthy), and **Cloud overflow** is enabled,
the request is sent to a configured cloud provider instead of queueing on busy nodes. With
overflow off, behaviour is unchanged (requests still queue on the nodes). See
[Adding Providers → Cloud overflow](Adding-Providers.md).

## Model equivalence chains

When the local cluster can't serve a model — every node saturated **or** no node has the model
at all — the orchestrator can redirect the request to the **closest equivalent model on another
provider** instead of failing or using a single fixed overflow model.

Define **equivalence groups** on the **Providers** page (Model equivalence section): an ordered
list of "similar" models across providers, closest first. For example:

| Position | Provider | Model |
| -------- | -------- | ----- |
| 1 | `ollama` | `gemma2:27b` |
| 2 | `xai` | `grok-2` |
| 3 | `openai` | `gpt-4o-mini` |

A request for `gemma2:27b` is tried locally first; if the cluster can't serve it, the orchestrator
descends the chain — `xai/grok-2`, then `openai/gpt-4o-mini` — **substituting the model** for each
provider's equivalent and falling through on provider errors until one responds. Members that are
disabled, missing credentials, or over budget are skipped. With no group for the model, overflow
falls back to the single pinned/first provider + its default model (the previous behaviour).

> **Use each provider's _own_ model name.** A cloud member's model must be a model that provider
> actually serves (e.g. `grok-2-latest` for xAI, `gpt-4o` for OpenAI) — **not** the local Ollama
> name. If you leave a cloud member set to the local name (`gemma2:27b`), the provider rejects it
> with `model_not_found` and that hop fails. The group editor offers each member a **picker of the
> provider's live `/v1/models` catalog** to make this hard to get wrong; the **Debug** page shows
> the substitute model actually sent (`gemma2:27b → grok-2-latest`) so a leaked local name is
> obvious. Spend is attributed to the substitute model the provider billed, not the local alias.

Applies to `/api/chat`, `/api/generate` and `/v1/chat/completions` (cloud members must be
OpenAI-compatible). Privacy mode / a per-request `x-local-only` disables it.

Manage groups via `GET/POST/PUT/DELETE /admin/model-equivalents`.

## Health & status

Each node is pinged every `HEALTHCHECK_INTERVAL_MS` (`GET /api/version` + `/api/tags`):

- **up** — reachable; models and latency refreshed
- **degraded** — a live request failed but health checks still pass
- **down** — health check failed
- **unknown** — not yet checked

Only `up`/`degraded` nodes receive traffic.
