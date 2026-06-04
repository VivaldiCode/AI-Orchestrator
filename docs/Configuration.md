# Configuration

All configuration is via environment variables (see `.env.example`). The API validates them
at startup with Zod and refuses to boot on invalid values.

| Variable                  | Default                                       | Description                                                   |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                | `development`                                 | `development` / `test` / `production`                         |
| `LOG_LEVEL`               | `info`                                        | pino log level                                                |
| `API_HOST`                | `0.0.0.0`                                     | bind address                                                  |
| `API_PORT`                | `11435`                                       | orchestrator port (Ollama itself uses 11434)                  |
| `TRUST_PROXY`             | `false`                                       | set `true` behind nginx/Traefik                               |
| `REQUEST_TIMEOUT_MS`      | `300000`                                      | max time for one upstream inference                           |
| `DATABASE_URL`            | `postgres://…`                                | PostgreSQL/TimescaleDB connection string                      |
| `ORCHESTRATOR_MASTER_KEY` | —                                             | **required in prod**; encrypts provider secrets (AES-256-GCM) |
| `JWT_SECRET`              | —                                             | **required in prod**; signs dashboard JWTs                    |
| `JWT_ACCESS_TTL`          | `900`                                         | access token lifetime (seconds)                               |
| `JWT_REFRESH_TTL`         | `2592000`                                     | refresh token lifetime (seconds)                              |
| `DASHBOARD_ORIGIN`        | `http://localhost:8080,http://localhost:5173` | comma-separated CORS allow-list                               |
| `RATE_LIMIT_MAX`          | `600`                                         | requests per window per client                                |
| `RATE_LIMIT_WINDOW`       | `60000`                                       | rate-limit window (ms)                                        |
| `DEFAULT_STRATEGY`        | `least-connections`                           | initial load-balancing strategy                               |
| `HEALTHCHECK_INTERVAL_MS` | `10000`                                       | how often nodes are pinged                                    |
| `HEALTHCHECK_TIMEOUT_MS`  | `3000`                                        | health-check timeout                                          |
| `NODE_FAILOVER_RETRIES`   | `2`                                           | other nodes to try on failure                                 |

## Generating secrets

```bash
openssl rand -base64 32
```

`ORCHESTRATOR_MASTER_KEY` may be any string ≥16 chars; if it base64-decodes to exactly
32 bytes it is used directly as the AES key, otherwise a 32-byte key is derived via SHA-256.

In `development`/`test`, missing secrets fall back to **insecure** defaults with a warning.
In `production` the server refuses to start without them.

## Runtime settings

Strategy, model-aware routing, auto-pull and failover retries are also editable live from the
dashboard **Settings** page and persisted in the database.
