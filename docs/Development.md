# Development

## Prerequisites

- Node 24 (`nvm use`)
- Docker (for PostgreSQL/TimescaleDB)

## Setup

```bash
nvm use
npm install
cp .env.example .env

# Start a database
docker compose up -d postgres
npm run db:migrate

# Run API + dashboard together
npm run dev
```

- API → http://localhost:11435
- Dashboard (Vite) → http://localhost:5173 (proxies `/admin` and `/ws` to the API)

## Useful scripts

| Command                           | Description                        |
| --------------------------------- | ---------------------------------- |
| `npm run dev`                     | API (tsx watch) + dashboard (vite) |
| `npm run typecheck`               | Type-check all workspaces          |
| `npm run lint` / `npm run format` | Lint / format                      |
| `npm test`                        | Unit + integration tests           |
| `npm run test:coverage`           | Coverage report                    |
| `npm run test:e2e`                | Playwright (needs a running stack) |
| `npm run db:migrate`              | Apply SQL migrations               |
| `npm run audit`                   | Fail on high/critical advisories   |

## Monorepo layout

- The API runs via **tsx** (no build step); `tsc` is type-check only.
- `packages/shared` is consumed directly as TypeScript source (no build).
- The dashboard builds with **Vite**; the landing page is static.

## Database migrations

The source of truth is hand-written SQL in `apps/api/src/db/migrations/*.sql` (TimescaleDB
features can't be expressed in the schema). The custom migrator (`db/migrate.ts`) tracks
applied files in a `_migrations` table and runs each in a transaction.

`apps/api/src/db/schema.ts` mirrors those tables for type-safe queries — keep them in sync.
