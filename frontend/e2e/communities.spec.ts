import { getCommunity } from './support/api';
import { expect, test } from './support/fixtures';

test.describe('creating a community', () => {
  test('a member registers a community and the backend keeps it', async ({
    authenticatedPage: page,
    request,
    apiUrl,
    memberAddress,
  }) => {
    const name = `E2E Community ${Date.now()}`;

    await page.goto('/communities/new');

    await page.getByLabel('Community name').fill(name);
    await page.getByLabel('Description').fill('Registered by the Playwright E2E suite.');
    await page.getByLabel('Issuer public key').fill(memberAddress);
    await page.getByLabel('Asset code').fill('E2E');
    await page.getByLabel('Asset issuer').fill(memberAddress);

    const [created] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/communities') && response.request().method() === 'POST'
      ),
      page.getByRole('button', { name: 'Create community' }).click(),
    ]);

    expect(created.status()).toBe(201);
    await expect(page.getByText('Community created successfully.')).toBeVisible();

    const body = (await created.json()) as { data: { id: string } };
    const community = await getCommunity(request, apiUrl, body.data.id);

    expect(community.name).toBe(name);
    expect(community.issuer_public_key).toBe(memberAddress);
    expect(community.asset_code).toBe('E2E');
  });
});
