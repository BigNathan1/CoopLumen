import { test, expect } from '@playwright/test';

test.describe('Home Page Landing', () => {
  test('loads successfully and renders the wallet connect button', async ({ page }) => {
    // 1. Navigate to the application root. The baseURL is defined in playwright.config.ts
    // and points to the running Docker Compose frontend service.
    await page.goto('/');

    // 2. Verify basic page load (adjust the regex if your title differs)
    await expect(page).toHaveTitle(/CoopLumen/i);

    // 3. Locate the Wallet Connect button by its accessible role and text.
    // Using a regex ensures case-insensitivity (matches "Connect Wallet", "Connect wallet", etc.)
    const connectButton = page.getByRole('button', { name: /connect wallet/i });

    // 4. Assert the button is visible in the viewport
    await expect(connectButton).toBeVisible();
  });
});