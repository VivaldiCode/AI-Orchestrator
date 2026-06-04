import { defineConfig } from 'vitest/config';

// Root Vitest config — runs unit & integration tests across all workspaces in a
// Node environment. End-to-end (Playwright) tests live in `e2e/` and are excluded.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['apps/**/*.{test,spec}.ts', 'packages/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '**/*.e2e.*', '**/._*'],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/test/**', '**/mocks/**'],
    },
  },
});
