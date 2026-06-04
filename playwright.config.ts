import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a running stack. Bring it up first with:
//   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
// then: npm run test:e2e
//
// Override the target with E2E_BASE_URL (defaults to the nginx `web` service).
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
