# Adding Providers

Beyond your local Ollama cluster, the orchestrator can route to cloud providers through its
OpenAI-compatible `/v1` surface. Credentials are **encrypted at rest** (AES-256-GCM) and never
returned by the API.

## Supported providers

| Type                | Transport          | Streaming        | Notes                           |
| ------------------- | ------------------ | ---------------- | ------------------------------- |
| `ollama`            | local nodes        | ✅               | the default; no provider needed |
| `openai`            | OpenAI `/v1`       | ✅               | proxied with your key           |
| `xai`               | xAI `/v1`          | ✅               | API key **or** [subscription login](xAI-Subscription.md) |
| `mistral`           | Mistral `/v1`      | ✅               | OpenAI-compatible               |
| `openai-compatible` | custom `baseUrl`   | ✅               | any compatible endpoint         |
| `anthropic`         | Messages API (SDK) | ⏳ non-streaming | translated to OpenAI shape      |
| `bedrock`           | Converse API (SDK) | ⏳ non-streaming | translated to OpenAI shape      |

> The fully end-to-end-exercised path is the local Ollama cluster. Cloud adapters ship with
> audited SDKs and clear extension points; streaming for Anthropic/Bedrock is on the roadmap.

## 1. Add the provider

Dashboard → **Providers** → choose a type, give it a name, and paste the key (or, for Bedrock,
the region + access keys).

## 2. Map a model alias (model registry)

A model alias maps a public model name (what clients request) to a provider + target model.

```bash
curl -X POST http://localhost:11435/admin/model-routes \
  -H "authorization: Bearer <admin-jwt>" \
  -H 'content-type: application/json' \
  -d '{
    "alias": "claude",
    "providerType": "anthropic",
    "providerId": "<provider-id>",
    "targetModel": "claude-sonnet-4-6"
  }'
```

Now `{"model":"claude"}` on `/v1/chat/completions` is routed to Anthropic. Models without a
route default to the local Ollama cluster.

## 3. Manage providers

Each provider card on the **Providers** page supports:

- **Enable / Disable** — keep a provider configured but temporarily out of rotation. A disabled
  provider is never used (including for cloud overflow).
- **Edit** — change the name, default model, base URL/region, or rotate the key/secret. Leaving a
  key field blank keeps the stored credential.
- **Delete** — remove the provider (and any model routes that referenced it).

## 4. Cloud overflow (spillover under load)

By default, requests to the **Ollama mirror** (`/api/chat`, `/api/generate`) only ever hit your
local nodes. Turn on **Settings → Cloud overflow** to spill to a cloud provider when every
candidate node is saturated (in-flight ≥ its **max concurrency**) or none are healthy — no model
route needed. This is what makes a cloud provider kick in when "many calls arrive at once".

Eligibility (a provider qualifies only if **all** hold):

- it is **enabled**,
- it is **OpenAI-compatible** (`openai`, `xai`, `mistral`, `openai-compatible`),
- it has an **API key**, and
- it has a **default model** — used as the target model for spilled requests.

Pick a specific provider in Settings, or leave it on **Auto** (first eligible one). Spilled
Ollama requests are translated to OpenAI `chat/completions` and the response is translated back
to the Ollama shape (streaming included), so existing Ollama clients need no changes. The
response carries an `x-orchestrator-overflow: <provider name>` header, and the request shows up
in Analytics/realtime under that provider. Overflow covers `/api/chat`, `/api/generate`, and
`/v1/chat/completions`; other endpoints stay node-only. Note: image/multimodal Ollama content is
dropped on spillover (text-only).
