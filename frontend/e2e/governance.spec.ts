import { createCommunity } from './support/api';
import { expect, test } from './support/fixtures';

test('a member creates a proposal and casts a vote through the real stack', async ({
  authenticatedPage: page,
  request,
  apiUrl,
  sessionToken,
  memberAddress,
}) => {
  const community = await createCommunity(request, apiUrl, sessionToken, {
    name: `Governance E2E ${Date.now()}`,
    description: 'Community created by the Playwright governance flow',
    issuerPublicKey: memberAddress,
    assetCode: 'GOV',
    assetIssuer: memberAddress,
  });

  // The browser still talks to the real backend. The fixture only supplies the
  // same signed session header a connected wallet would establish.
  await page.goto(`/governance?communityId=${community.id}`);
  await page.getByLabel('Title').fill('Fund the community clinic');
  await page
    .getByLabel('Description')
    .fill('Release the approved grant for essential medical supplies.');
  await page.getByRole('button', { name: 'Create proposal' }).click();

  await expect(page.getByRole('heading', { name: 'Fund the community clinic' })).toBeVisible();
  await expect(page.getByText('Proposal created and voting is open.')).toBeVisible();
  await expect(page.getByTestId('votes-for')).toHaveText('0');

  await page.getByRole('button', { name: 'Vote for' }).click();

  await expect(page.getByText('Vote recorded.')).toBeVisible();
  await expect(page.getByTestId('votes-for')).toHaveText('1.0000000');
});
