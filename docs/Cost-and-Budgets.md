# Cost tracking & budgets

The orchestrator can attribute a **USD cost** to every request and enforce a **monthly budget**
per provider, rerouting away from any provider that runs over.

## Pricing

Prices are token rates in **USD per 1,000,000 tokens**, set on the **Providers** page (Model
pricing section) or via `/admin/prices`:

- Keyed by `(provider, model)`. `provider` is the analytics key — `ollama` for the local cluster,
  or a provider type (`openai`, `anthropic`, `xai`, `mistral`, `google`).
- `model` is a model name, or `*` for a provider-wide default used when a specific model has no row.
- **Local (`ollama`) rates are yours to set** (default 0 — e.g. electricity, or leave at 0). Cloud
  providers ship with reasonable built-in defaults that you can edit.

Cost per request = `prompt_tokens/1e6 × input_rate + completion_tokens/1e6 × output_rate`, stored
on each `request_events` row and surfaced in **Analytics** (Total cost + per node/model/provider
/endpoint breakdowns).

## Budgets

Each provider has an optional **monthly budget** (USD; 0 = none) on the Providers page. The
orchestrator tracks month-to-date spend per provider (calendar month, refreshed every 60s). When a
provider's spend **meets or exceeds** its budget, it is **excluded from cloud-overflow selection**
— traffic reroutes to the next eligible provider, and if none remain, stays on the local cluster.

The Providers page shows `spent / budget` per provider (red when over).

## Provider detail page

Click a provider's name on the **Providers** page to open its detail view (`/providers/:id`):

- **Account balance** — fetched **live** from the provider's API where one exists
  (OpenRouter `/api/v1/credits`, DeepSeek `/user/balance`). Most providers (OpenAI, Anthropic, and
  xAI's inference/subscription token) do **not** expose a balance endpoint, so it shows
  _"not available via API"_ for those.
- **Spend this month** — total cost, requests, tokens, average latency and a per-model breakdown
  for that provider (from analytics).
- **Prompts sent here** — the archived request/response exchanges for that provider (newest first),
  each expandable to view the raw prompt + response. **Playground** calls and OpenAI-compatible
  cloud requests are now archived too, so everything sent to the provider — including via the
  Query Playground — appears here and counts toward its tracked spend.

> Spend is attributed by provider **type** (the analytics key), so multiple providers of the same
> type share these figures.

## API

| Endpoint                                            | Purpose                                              |
| --------------------------------------------------- | ---------------------------------------------------- |
| `GET/POST/PATCH/DELETE /admin/prices`               | manage model prices (POST upserts by provider+model) |
| `PATCH /admin/providers/:id` `{ budgetMonthlyUsd }` | set a provider budget                                |
| `GET /admin/providers`                              | includes `budgetMonthlyUsd` + `spentThisMonthUsd`    |
| `GET /admin/providers/:id/balance`                  | best-effort live account balance                     |
| `GET /admin/analytics?provider=<type>`              | spend detail for one provider                        |
| `GET /admin/archive?provider=<type>`                | archived prompts for one provider                    |
