import { getCommunity } from './support/api';
import { expect, test } from './support/fixtures';
import { E2E_WALLET_ADDRESS, installFreighter } from './support/freighter';

test.describe('Create community flow', () => {
  test.beforeEach(async ({ page }) => {
    await installFreighter(page);
  });

  test('successfully fills the form, submits, and renders the success state', async ({
    page,
    request,
    apiUrl,
  }) => {
    // Sign in through the wallet, as a user would, rather than with a minted
    // token, so the request below carries the session the app really holds.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Connect Freighter' }).click();
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();

    // The site is now allowed, so the next page signs in again on load.
    const [reconnected] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/verify')),
      page.goto('/communities/new'),
    ]);
    expect(reconnected.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Create a community' })).toBeVisible();

    const name = `E2E Wallet Community ${Date.now()}`;
    await page.getByLabel('Community name').fill(name);
    await page
      .getByLabel('Description')
      .fill('Created by the Playwright suite after a real wallet sign-in.');
    // The backend only accepts a community issued by the signed-in address.
    await page.getByLabel('Issuer public key').fill(E2E_WALLET_ADDRESS);
    await page.getByLabel('Asset code').fill('WLT');
    await page.getByLabel('Asset issuer').fill(E2E_WALLET_ADDRESS);

    const [created] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/communities') && response.request().method() === 'POST'
      ),
      page.getByRole('button', { name: 'Create community' }).click(),
    ]);

    expect(created.status()).toBe(201);
    await expect(page.getByText('Community created successfully.')).toBeVisible();

    const body = (await created.json()) as { data: { id: string } };
    const community = await getCommunity(request, apiUrl, body.data.id);
    expect(community.name).toBe(name);
    expect(community.issuer_public_key).toBe(E2E_WALLET_ADDRESS);
  });
});
