import { createCommunity } from './support/api';
import { expect, test } from './support/fixtures';
import { createSessionToken } from './support/session';

/** A signed-in address with no role in the community, from `sha256('cooplumen-e2e-outsider')`. */
const OUTSIDER = 'GC6LGDNIMHRAHFQCXG5ZF7RMV6OMQFMWEQVERU5CKAMB3IEHUGLE4FW4';

test.describe('Issue community token flow', () => {
  test('a new community starts with no tokens', async ({
    authenticatedPage: page,
    request,
    apiUrl,
    memberAddress,
    sessionToken,
  }) => {
    const community = await createCommunity(request, apiUrl, sessionToken, {
      name: `E2E Token Test ${Date.now()}`,
      issuerPublicKey: memberAddress,
      assetCode: 'CLUM',
      assetIssuer: memberAddress,
    });

    await page.goto(`/communities/${community.id}/tokens`);

    // The page is titled with the community it belongs to.
    await expect(page.getByRole('heading', { name: community.name, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No tokens yet' })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to community/i })).toHaveAttribute(
      'href',
      `/communities/${community.id}`
    );
  });

  test('only an admin or treasurer may build an issuance', async ({
    request,
    apiUrl,
    memberAddress,
    sessionToken,
  }) => {
    await createCommunity(request, apiUrl, sessionToken, {
      name: `E2E Token Guard ${Date.now()}`,
      issuerPublicKey: memberAddress,
      assetCode: 'GARD',
      assetIssuer: memberAddress,
    });

    // The role check runs before the transaction is built, so the refusal
    // needs no funded account on the network.
    const response = await request.post(`${apiUrl}/api/v1/tokens/build-issue`, {
      headers: { Authorization: `Bearer ${createSessionToken(OUTSIDER)}` },
      data: {
        issuerPublicKey: memberAddress,
        assetCode: 'GARD',
        distributorPublicKey: OUTSIDER,
        amount: '1000',
      },
    });

    expect(response.status()).toBe(403);
  });

  // Issuing through the browser needs the issuance form on a page (it is not
  // mounted on any route yet) and a funded testnet issuer for the wallet to
  // sign against.
  test.fixme('a treasurer issues a token through the browser', async () => {});
});
