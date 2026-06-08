# Query Playground

The **Playground** (dashboard → *Playground*) lets you fire a test request at your
providers in either the **OpenAI** or **Anthropic** format and see exactly what
comes back — without wiring up a client, an API key, or worrying about CORS.

Requests go through the **real production path** (`/v1/chat/completions` or
`/v1/messages`), so routing, model aliases, cloud overflow, budgets and privacy
mode all apply exactly as they would for a real client. The response shows **who
served it** (node or provider), **latency**, **token usage**, and the assistant
text, plus the raw JSON.

## Using it

1. Pick a **format** — OpenAI (`/v1/chat/completions`) or Anthropic
   (`/v1/messages`).
2. Pick a **provider** and a **model** from the dropdowns. The lists are built
   from what's actually available: *Local (Ollama)* shows the union of your
   nodes' models, and each configured provider shows its **live model catalog**
   (fetched from its `/v1/models`) plus any routed aliases and its default model.
   - Choosing a specific provider **targets it directly** (it bypasses the alias
     registry), so you can test any configured provider — not only models that
     have a route. *Local (Ollama)* uses normal routing.
3. Optionally set a **system prompt**, then type a **user message**.
4. Tune **temperature** / **max tokens** if you like (Anthropic requires
   max tokens — it defaults to 1024).
5. **Send request.** The response panel shows status, served-by, latency, tokens
   and the text; expand **Raw response** for the full JSON, or **Request body**
   to see exactly what was sent.

## What it's good for

- **Smoke-testing a new provider or model route** end to end.
- **Comparing formats** — send the same prompt as OpenAI vs Anthropic and confirm
  both translate correctly onto the same backend.
- **Checking routing** — the *Served by* chip tells you which Mac (or cloud
  provider / overflow target) actually handled the request.
- **Verifying privacy/budget** — a model that resolves to a cloud provider under
  privacy mode, or a provider over budget, is blocked here just like in
  production, and the error is shown.

## Notes

- The Playground requires the **`providers:read`** permission (admin has it).
- It runs **non-streaming** for a clean result; the underlying endpoints still
  support streaming for real clients.
- These are **real inference calls** — they appear in Live requests / Analytics
  and count toward provider budgets. Requests are tagged with an
  `x-orchestrator-playground` header in the archive so you can tell them apart.

## Under the hood

`POST /admin/playground` with `{ "format": "openai" | "anthropic", "body": { … } }`
replays `body` through the production handler and captures the response:

```json
{
  "status": 200,
  "latencyMs": 412,
  "servedBy": { "nodeId": "…", "nodeName": "Mac Studio", "provider": null },
  "contentType": "application/json; charset=utf-8",
  "body": { "...": "the provider response" },
  "raw": "…"
}
```
