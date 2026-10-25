import { createCommunity, type CommunityRecord } from './support/api';
import { expect, test } from './support/fixtures';

test.describe('Community transaction history', () => {
  let community: CommunityRecord;

  test.beforeEach(async ({ request, apiUrl, memberAddress, sessionToken }) => {
    community = await createCommunity(request, apiUrl, sessionToken, {
      name: `TxHistory E2E ${Date.now()}`,
      description: 'Community created by the Playwright transaction history flow',
      issuerPublicKey: memberAddress,
      assetCode: 'HIST',
      assetIssuer: memberAddress,
    });
  });

  test('shows a new community with its creation as the only entry', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/communities/${community.id}/transactions`);

    await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
    await expect(page.getByText(community.name)).toBeVisible();

    const backToDashboard = page.getByRole('link', { name: 'Back to dashboard' });
    await expect(backToDashboard).toHaveAttribute('href', '/dashboard');

    // Creating a community records it in the history; nothing has happened
    // on-chain yet.
    const history = page.getByRole('region', { name: 'Transaction history' });
    await expect(history.getByRole('row', { name: /Community created/ })).toBeVisible();
    await expect(history.getByRole('cell', { name: 'No on-chain transaction' })).toBeVisible();
  });

  test('loads the page named in the page query parameter', async ({ authenticatedPage: page }) => {
    await page.goto(`/communities/${community.id}/transactions?page=1`);

    await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Community created/ })).toBeVisible();
  });
});
