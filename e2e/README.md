# End-to-end tests

Playwright tests that drive the dashboard against a running stack.

```bash
# 1. Bring up the stack with mock Ollama nodes (fresh DB)
cp .env.example .env   # set ORCHESTRATOR_MASTER_KEY and JWT_SECRET
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build

# 2. Install browsers (first time only)
npx playwright install --with-deps chromium

# 3. Run the tests (defaults to http://localhost:8080)
npm run test:e2e

# 4. Reset between runs
docker compose down -v
```

Override the target with `E2E_BASE_URL`.
