import { createCommunity } from './support/api';
import { expect, test } from './support/fixtures';

test('the community loans page loads a new community from the real stack', async ({
  authenticatedPage: page,
  request,
  apiUrl,
  sessionToken,
  memberAddress,
}) => {
  const name = `Lending E2E ${Date.now()}`;
  const community = await createCommunity(request, apiUrl, sessionToken, {
    name,
    description: 'Community created by the Playwright lending flow',
    issuerPublicKey: memberAddress,
    assetCode: 'LEND',
    assetIssuer: memberAddress,
  });

  await page.goto(`/communities/${community.id}/loans`);

  await expect(page.getByRole('heading', { level: 1, name: 'Loans' })).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText('No loans yet')).toBeVisible();
  // Requesting a loan needs a connected Freighter wallet.
  await expect(page.getByText('Connect your wallet to request a loan.')).toBeVisible();
});
