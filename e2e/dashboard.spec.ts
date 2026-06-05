import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end happy path against a freshly started stack:
 *   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
 *
 * Expects an empty database on first run (first-run admin setup). Run
 * `docker compose down -v` between runs to reset.
 */

const USERNAME = 'admin';
const PASSWORD = 'change-me-please-1';

/** Sign in, doing first-run admin setup if the database is still empty. */
async function authenticate(page: Page): Promise<void> {
  await page.goto('/');
  const setup = page.getByText('Create the first admin account');
  const login = page.getByText('Sign in to the control panel');
  await expect(setup.or(login)).toBeVisible();

  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Password').fill(PASSWORD);
  if (await setup.isVisible()) {
    await page.getByRole('button', { name: 'Create account' }).click();
  } else {
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

test.describe.serial('dashboard', () => {
  test('first-run setup, then register a node', async ({ page }) => {
    await authenticate(page);
    await expect(page.getByTestId('realtime-status')).toBeVisible();

    // Add a node pointing at the mock Ollama service.
    await page.getByRole('link', { name: 'Nodes' }).click();
    await expect(page.getByRole('heading', { name: 'Nodes' })).toBeVisible();

    const nodeName = `mock-${Date.now()}`;
    await page.getByLabel('Name').fill(nodeName);
    await page.getByLabel('Host / IP').fill('mock-ollama');
    await page.getByRole('button', { name: 'Add node' }).click();

    await expect(page.getByText(nodeName)).toBeVisible();
    await expect(page.getByText('mock-ollama:11434')).toBeVisible();
  });

  test('add then remove a provider', async ({ page }) => {
    await authenticate(page);

    await page.getByRole('link', { name: 'Providers' }).click();
    await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();

    // Add an OpenAI-compatible provider (default type is openai).
    const name = `prov-${Date.now()}`;
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('API key').fill('sk-e2e-test');
    await page.getByRole('button', { name: 'Add provider' }).click();

    // Its card shows up.
    await expect(page.getByText(name)).toBeVisible();

    // Delete it — the page asks for confirmation via window.confirm().
    page.once('dialog', (dialog) => dialog.accept());
    const card = page
      .locator('div')
      .filter({ has: page.getByText(name, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'Delete' }) })
      .last();
    await card.getByRole('button', { name: 'Delete' }).click();

    // The card disappears (provider actually removed).
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
