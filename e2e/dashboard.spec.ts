import { expect, test } from '@playwright/test';

/**
 * End-to-end happy path against a freshly started stack:
 *   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
 *
 * Expects an empty database (first-run setup). Run `docker compose down -v`
 * between runs to reset.
 */
test.describe('dashboard', () => {
  test('first-run setup, then register a node', async ({ page }) => {
    await page.goto('/');

    // First-run setup screen.
    await expect(page.getByText('Create the first admin account')).toBeVisible();
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('change-me-please-1');
    await page.getByRole('button', { name: 'Create account' }).click();

    // Lands on the overview.
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByTestId('realtime-status')).toBeVisible();

    // Add a node pointing at the mock Ollama service.
    await page.getByRole('link', { name: 'Nodes' }).click();
    await expect(page.getByRole('heading', { name: 'Nodes' })).toBeVisible();

    const nodeName = `mock-${Date.now()}`;
    await page.getByLabel('Name').fill(nodeName);
    await page.getByLabel('Host / IP').fill('mock-ollama');
    await page.getByRole('button', { name: 'Add node' }).click();

    // The node appears in the table.
    await expect(page.getByText(nodeName)).toBeVisible();
    await expect(page.getByText('mock-ollama:11434')).toBeVisible();
  });
});
