import { expect, test } from './support/fixtures';
import { E2E_WALLET_ADDRESS, installFreighter } from './support/freighter';

/** How the wallet header shortens an address: first six, last four. */
const SHORT_ADDRESS = `${E2E_WALLET_ADDRESS.slice(0, 6)}…${E2E_WALLET_ADDRESS.slice(-4)}`;

test.describe('Wallet connection flow', () => {
  test.beforeEach(async ({ page }) => {
    await installFreighter(page);
  });

  test('successfully connects the wallet, signs in and updates the UI', async ({ page }) => {
    await page.goto('/dashboard');

    const connectButton = page.getByRole('button', { name: 'Connect Freighter' });
    await expect(connectButton).toBeVisible();

    // Connecting signs the backend's challenge with the wallet key; the
    // backend only issues a session when the signature verifies.
    const [verified] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/auth/verify') && response.request().method() === 'POST'
      ),
      connectButton.click(),
    ]);
    expect(verified.status()).toBe(200);

    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    await expect(page.getByText(SHORT_ADDRESS)).toBeVisible();

    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(connectButton).toBeVisible();
  });
});
