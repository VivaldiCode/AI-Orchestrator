# Admin API (no UI)

Everything the dashboard does is a REST API under `/admin/*`. You can drive it from scripts,
cron jobs or your own tooling — no browser required.

## Authentication

Two ways to authenticate against `/admin/*`:

1. **Admin API key (recommended for automation).** Create an API key with the **`admin`** scope
   (Dashboard → **API Keys** → scope _Admin_, or `POST /admin/api-keys`) and send it as a bearer
   token. It's hashed at rest and revocable from the dashboard at any time.

   ```bash
   curl -H "Authorization: Bearer aio_sk_…" http://localhost:11435/admin/nodes
   ```

2. **Dashboard JWT.** `POST /admin/auth/login` with `{username,password}` → use the returned
   `accessToken` as the bearer. Short-lived; refresh via `POST /admin/auth/refresh`.

> An `admin`-scoped key grants the **full** admin surface (every permission). Treat it like a
> root credential. Inference clients should keep using `inference`-scoped keys.

### Bootstrapping the first admin key

```bash
BASE=http://localhost:11435
TOK=$(curl -s -X POST $BASE/admin/auth/login -H 'content-type: application/json' \
  -d '{"username":"admin","password":"…"}' | jq -r .accessToken)
curl -s -X POST $BASE/admin/api-keys -H "Authorization: Bearer $TOK" \
  -H 'content-type: application/json' -d '{"name":"automation","scopes":["admin"]}'
# → { "secret": "aio_sk_…" }  (shown once)
```

## What you can do

Same operations as the dashboard, e.g.:

| Area      | Examples                                                           |
| --------- | ------------------------------------------------------------------ |
| Nodes     | `GET/POST/PATCH/DELETE /admin/nodes`, `POST /admin/nodes/:id/test` |
| Providers | `GET/POST/PATCH/DELETE /admin/providers`                           |
| Settings  | `GET/PUT /admin/settings` (strategy, overflow, privacy, …)         |
| Users     | `GET/POST/PATCH/DELETE /admin/users`                               |
| API keys  | `GET/POST/DELETE /admin/api-keys`                                  |
| Analytics | `GET /admin/analytics`                                             |
| Archive   | `GET /admin/archive*` (see below)                                  |

Full schema: the OpenAPI spec at `/openapi.json` and Swagger UI at `/docs`.

## Request archive

When `ARCHIVE_ENABLED=true` (see [Configuration](Configuration.md)), every inference request and
response is stored on disk. Browse it (admin only):

| Endpoint                                  | Returns                                          |
| ----------------------------------------- | ------------------------------------------------ |
| `GET /admin/archive/dates`                | available days (`YYYY-MM-DD`), newest first      |
| `GET /admin/archive?date=&limit=&offset=` | a page of entries for a day (defaults to latest) |
| `GET /admin/archive/:date/:id`            | one entry's metadata                             |
| `GET /admin/archive/:date/:id/request`    | the raw request body (the prompt)                |
| `GET /admin/archive/:date/:id/response`   | the raw response body                            |

```bash
# the 20 most recent requests today, then fetch the first one's prompt
curl -s "$BASE/admin/archive?limit=20" -H "Authorization: Bearer $KEY" | jq '.items[].id'
curl -s "$BASE/admin/archive/2026-06-06/req_abc/request" -H "Authorization: Bearer $KEY"
```

Each entry records: timestamp, endpoint, model, node/provider, client IP, status, latency, token
counts, byte sizes and (sanitised) request headers.
