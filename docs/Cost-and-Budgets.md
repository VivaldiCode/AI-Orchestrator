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

## API

| Endpoint                                            | Purpose                                              |
| --------------------------------------------------- | ---------------------------------------------------- |
| `GET/POST/PATCH/DELETE /admin/prices`               | manage model prices (POST upserts by provider+model) |
| `PATCH /admin/providers/:id` `{ budgetMonthlyUsd }` | set a provider budget                                |
| `GET /admin/providers`                              | includes `budgetMonthlyUsd` + `spentThisMonthUsd`    |
| `GET /admin/analytics`                              | includes `totalCostUsd` + `costUsd` per breakdown    |
