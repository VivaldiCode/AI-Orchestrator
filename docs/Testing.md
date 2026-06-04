# Testing

The project ships with tests from day one.

## Unit & integration (Vitest)

```bash
npm test
npm run test:coverage
```

These run in a Node environment and **do not require a database** — the integration tests use
an in-memory registry, a fake recorder, and a real mock Ollama HTTP server:

- `strategies.test.ts` — load-balancing selection
- `crypto.test.ts` — scrypt, AES-256-GCM, API keys
- `proxy.test.ts` — token extraction, header filtering, model matching
- `migrate.test.ts` — SQL statement splitter
- `hub.test.ts` — realtime fan-out
- `dispatcher.integration.test.ts` — proxy + load distribution + failover (mock Ollama)
- `server.test.ts` — app boots; `/healthz` and `/api/version`
- dashboard: `lib/format.test.ts`

## End-to-end (Playwright)

Drives the dashboard against a running stack — see [e2e/README.md](../e2e/README.md):

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
npx playwright install --with-deps chromium
npm run test:e2e
docker compose down -v
```

## CI

`.github/workflows/ci.yml` runs format-check, lint, typecheck, unit/integration tests, the
dashboard build, and `npm audit` on every push/PR. `.github/workflows/e2e.yml` brings up the
stack and runs Playwright.
