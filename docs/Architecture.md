# Architecture

AI Orchestrator is a TypeScript monorepo with three deployable pieces plus a shared
contracts package.

```
   clients (Ollama API / OpenAI API)
                 │
                 ▼
   ┌─────────────────────────────────────┐
   │        Orchestrator API (Fastify)    │
   │  ┌─────────────┐  ┌────────────────┐ │
   │  │ Ollama mirror│  │ OpenAI /v1     │ │
   │  │ /api/*       │  │ /v1/*          │ │
   │  └──────┬──────┘  └────────┬───────┘ │
   │         ▼                  ▼          │
   │   registry · health · strategies     │
   │   dispatcher · providers · metrics   │
   │   realtime (WebSocket)               │
   └───────┬───────────────────┬──────────┘
           │                   │
   ┌───────┼───────┐      ┌────▼─────┐    ┌────────────────────────┐
   ▼       ▼       ▼      │ dashboard│    │ cloud providers         │
 Mac1    Mac2    Mac3     │  (nginx) │    │ Anthropic/OpenAI/xAI/…  │
 Ollama  Ollama  Ollama   └──────────┘    └────────────────────────┘
           │
           ▼
   PostgreSQL + TimescaleDB
```

## Packages

| Path              | What                                            |
| ----------------- | ----------------------------------------------- |
| `apps/api`        | Fastify server: the orchestrator                |
| `apps/dashboard`  | React + Vite control panel                      |
| `apps/landing`    | Static marketing page                           |
| `packages/shared` | Zod contracts + types shared by api ⇄ dashboard |

## Request flow (Ollama inference)

1. A client calls the orchestrator on a normal Ollama path (e.g. `POST /api/chat`).
2. The **dispatcher** reads the model, picks healthy candidate nodes (model-aware), and
   selects one via the configured **strategy**.
3. The request is proxied with **streaming passthrough**; the response is `tee`'d so token
   usage can be parsed without delaying the client.
4. On a connection error or 5xx (before any bytes are sent), it **fails over** to another node.
5. A `request_events` row is written (TimescaleDB) and realtime events are broadcast.

## Key modules (`apps/api/src`)

- `orchestrator/registry.ts` — in-memory node state + live metrics
- `orchestrator/health.ts` — periodic health checks
- `orchestrator/strategies.ts` — pure load-balancing functions
- `orchestrator/dispatcher.ts` — proxy + failover + metrics
- `providers/*` — cloud provider adapters + model registry
- `analytics/*` — recording + TimescaleDB queries
- `realtime/*` — WebSocket hub

## Why these choices

- **tsx everywhere** — run TypeScript directly; no separate build step for the API.
- **`postgres` + Drizzle** — type-safe queries, pure-JS driver, no native build.
- **`node:crypto`** — scrypt + AES-256-GCM with zero extra dependencies.
