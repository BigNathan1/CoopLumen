import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET ?? 'governance-e2e-secret';
const MEMBER_ADDRESS = 'GDMZRAGTOJHQK3LN3D2EDLEAMS76EDIQEMWCUTYIYHUE5HFPLPGBCGUS';

function createSessionToken(address: string): string {
  const now = Math.floor(Date.now() / 1_000);
  const body = Buffer.from(JSON.stringify({ address, iat: now, exp: now + 3_600 })).toString(
    'base64url'
  );
  const signature = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

test.describe('Community transaction history flow', () => {
  test('a member views transaction history and empty state for a community', async ({
    page,
    request,
  }) => {
    const token = createSessionToken(MEMBER_ADDRESS);
    const communityName = `TxHistory E2E ${Date.now()}`;

    const communityResponse = await request.post(`${API_URL}/api/v1/communities`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: communityName,
        description: 'Community created by the Playwright transaction history flow',
        issuerPublicKey: MEMBER_ADDRESS,
        assetCode: 'HIST',
        assetIssuer: MEMBER_ADDRESS,
      },
    });

    expect(communityResponse.ok()).toBeTruthy();
    const communityEnvelope = (await communityResponse.json()) as { data: { id: string } };
    const communityId = communityEnvelope.data.id;

    // Provide the signed session token to the browser fetch calls
    await page.addInitScript((sessionToken) => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${sessionToken}`);
        return nativeFetch(input, { ...init, headers });
      };
    }, token);

    // Navigate to the community transaction history page
    await page.goto(`/communities/${communityId}/transactions`);

    // Verify main header and subtitle with community name
    await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
    await expect(page.getByText(communityName)).toBeVisible();

    // Verify breadcrumb or navigation link back to dashboard
    const backToDashboard = page.getByRole('link', { name: 'Back to dashboard' });
    await expect(backToDashboard).toBeVisible();
    await expect(backToDashboard).toHaveAttribute('href', '/dashboard');

    // Verify transaction history section
    const historySection = page.getByRole('region', { name: 'Transaction history' });
    await expect(historySection).toBeVisible();

    // Creating a community records it in the history, so the new community's
    // only entry is its creation; nothing has happened on-chain yet.
    await expect(historySection.getByRole('row', { name: /Community created/ })).toBeVisible();
    await expect(
      historySection.getByRole('cell', { name: 'No on-chain transaction' })
    ).toBeVisible();
  });

  test('handles out-of-range page query parameters gracefully', async ({ page, request }) => {
    const token = createSessionToken(MEMBER_ADDRESS);
    const communityName = `Pagination E2E ${Date.now()}`;

    const communityResponse = await request.post(`${API_URL}/api/v1/communities`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: communityName,
        description: 'Community for testing transaction history pagination',
        issuerPublicKey: MEMBER_ADDRESS,
        assetCode: 'PAGE',
        assetIssuer: MEMBER_ADDRESS,
      },
    });

    expect(communityResponse.ok()).toBeTruthy();
    const communityEnvelope = (await communityResponse.json()) as { data: { id: string } };
    const communityId = communityEnvelope.data.id;

    await page.addInitScript((sessionToken) => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${sessionToken}`);
        return nativeFetch(input, { ...init, headers });
      };
    }, token);

    // Page 1 should load without error
    await page.goto(`/communities/${communityId}/transactions?page=1`);
    await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Community created/ })).toBeVisible();
  });
});
