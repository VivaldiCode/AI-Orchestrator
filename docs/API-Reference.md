# API Reference

The orchestrator exposes four surfaces: the **Ollama mirror** (`/api/*`), the
**OpenAI-compatible** layer (`/v1/*`), the **Anthropic Messages API**
(`/v1/messages`, what Claude Code speaks), and the **management API**
(`/admin/*`).

> **Interactive docs:** Swagger UI is served at **`/docs`** and the raw spec at
> **`/openapi.json`** — both reachable from the dashboard's **Docs** page.

## Ollama mirror (`/api/*`)

Every Ollama endpoint is proxied. Inference is load-balanced; `tags`/`ps` are aggregated;
model management targets a single node (choose with `?node=<id>`).

| Method    | Path                                    | Routing                      |
| --------- | --------------------------------------- | ---------------------------- |
| POST      | `/api/generate`                         | load-balanced (streaming)    |
| POST      | `/api/chat`                             | load-balanced (streaming)    |
| POST      | `/api/embed`, `/api/embeddings`         | load-balanced                |
| POST      | `/api/show`                             | a node that has the model    |
| GET       | `/api/tags`                             | union across nodes           |
| GET       | `/api/ps`                               | union across nodes           |
| GET       | `/api/version`                          | orchestrator (open, no auth) |
| POST      | `/api/pull`, `/api/push`, `/api/create` | single node (`?node=`)       |
| POST      | `/api/copy`, DELETE `/api/delete`       | single node (`?node=`)       |
| HEAD/POST | `/api/blobs/:digest`                    | single node (`?node=`)       |

## OpenAI-compatible (`/v1/*`)

| Method | Path                   |
| ------ | ---------------------- |
| GET    | `/v1/models`           |
| POST   | `/v1/chat/completions` |
| POST   | `/v1/completions`      |
| POST   | `/v1/embeddings`       |

Routing: model aliases resolve through the model registry; unmapped models go to the local
Ollama cluster.

## Anthropic Messages API (`/v1/messages`)

The API Claude Code speaks. See **[Using Claude Code](Claude-Code.md)** for the full guide.

| Method | Path                         | Notes                                       |
| ------ | ---------------------------- | ------------------------------------------- |
| POST   | `/v1/messages`               | streaming + non-streaming, tools            |
| POST   | `/v1/messages/count_tokens`  | `{ "input_tokens": N }` estimate            |

Routing: a model mapped to (or matching) an Anthropic provider **passes through** with full
fidelity; otherwise the request is translated Anthropic⇄OpenAI and dispatched to the local
cluster (with failover) or cloud overflow — tool calling and streaming included.

## Authentication

- **Inference** (`/api/*`, `/v1/*`, `/v1/messages`): open until the first API key is created,
  then a credential is required. Accepts `Authorization: Bearer <key>` **or** `x-api-key: <key>`
  (so Claude Code's `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` both work).
- **Management** (`/admin/*`): a dashboard JWT access token, or an admin-scoped API key.

## Management API (`/admin/*`)

| Method           | Path                       | Purpose                              |
| ---------------- | -------------------------- | ------------------------------------ |
| GET              | `/admin/auth/setup-status` | whether first-run setup is needed    |
| POST             | `/admin/auth/setup`        | create the first admin               |
| POST             | `/admin/auth/login`        | obtain tokens                        |
| POST             | `/admin/auth/refresh`      | refresh tokens                       |
| GET              | `/admin/auth/me`           | current user                         |
| GET/POST         | `/admin/nodes`             | list / create nodes                  |
| GET/PATCH/DELETE | `/admin/nodes/:id`         | read / update / delete               |
| POST             | `/admin/nodes/:id/test`    | live connectivity test               |
| GET/POST         | `/admin/providers`         | list / create providers              |
| PATCH/DELETE     | `/admin/providers/:id`     | update / delete a provider           |
| POST             | `/admin/providers/:id/xai/device/start` | start xAI subscription device login |
| POST             | `/admin/providers/:id/xai/device/poll`  | poll the device login for approval |
| POST             | `/admin/providers/:id/xai/disconnect`   | clear stored subscription tokens |
| GET/POST/DELETE  | `/admin/model-routes`      | model registry                       |
| GET/PUT          | `/admin/settings`          | orchestrator settings                |
| GET              | `/admin/analytics`         | metrics summary + series             |
| POST             | `/admin/playground`        | replay a test request (openai/anthropic) |
| GET/POST/DELETE  | `/admin/api-keys`          | inference API keys                   |
| GET              | `/healthz`                 | liveness probe                       |
| WS               | `/ws`                      | realtime events (optional `?token=`) |
