import { createCommunity } from './support/api';
import { expect, test } from './support/fixtures';

/** A throwaway address to add, derived from `sha256('cooplumen-e2e-new-member')`. */
const NEW_MEMBER = 'GCWE25UAPSC4JY7LQA6P4G4GMKJVSH4C3DQXEVW77RCZCZB7TYDRFAPD';

test.describe('Add member to community flow', () => {
  test('an admin adds a member and the list shows them', async ({
    authenticatedPage: page,
    request,
    apiUrl,
    memberAddress,
    sessionToken,
  }) => {
    // The creator of a community is its admin, and only an admin adds members.
    const community = await createCommunity(request, apiUrl, sessionToken, {
      name: `E2E Member Test ${Date.now()}`,
      issuerPublicKey: memberAddress,
      assetCode: 'MEMB',
      assetIssuer: memberAddress,
    });

    await page.goto(`/communities/${community.id}/members`);
    await expect(page.getByRole('heading', { name: 'Manage members' })).toBeVisible();

    await page.getByLabel('Stellar address').fill(NEW_MEMBER);

    const [added] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/v1/communities/${community.id}/members`) &&
          response.request().method() === 'POST'
      ),
      page.getByRole('button', { name: 'Add member' }).click(),
    ]);
    expect(added.status()).toBe(201);

    const shortAddress = `${NEW_MEMBER.slice(0, 6)}…${NEW_MEMBER.slice(-4)}`;
    await expect(page.getByRole('button', { name: `Remove ${shortAddress}` })).toBeVisible();

    const members = await request.get(`${apiUrl}/api/v1/communities/${community.id}/members`);
    const listed = (await members.json()) as { data: { stellar_address: string }[] };
    expect(listed.data.map((member) => member.stellar_address)).toContain(NEW_MEMBER);
  });
});
