import type { APIRequestContext } from '@playwright/test';
import { createCommunity } from './support/api';
import { expect, test } from './support/fixtures';
import { E2E_WALLET_ADDRESS, installFreighter } from './support/freighter';
import { createSessionToken } from './support/session';

/** The stack's fake Horizon (frontend/e2e/support/fake-horizon.mjs). */
const HORIZON_URL = process.env.PLAYWRIGHT_HORIZON_URL ?? 'http://127.0.0.1:8100';

const ASSET_CODE = 'FUND';

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function submittedEnvelopes(request: APIRequestContext): Promise<string[]> {
  const response = await request.get(`${HORIZON_URL}/_e2e/transactions`);
  expect(response.ok()).toBe(true);
  const { records } = (await response.json()) as { records: { envelope: string }[] };
  return records.map((record) => record.envelope);
}

test('a lender disburses a pending pool loan into escrow', async ({
  page,
  request,
  apiUrl,
  memberAddress: borrower,
}) => {
  // The wallet is the community's issuer, so it is the lender for pool loans.
  const lender = E2E_WALLET_ADDRESS;
  const lenderToken = createSessionToken(lender);
  const borrowerToken = createSessionToken(borrower);

  const community = await createCommunity(request, apiUrl, lenderToken, {
    name: `Lending Fund E2E ${Date.now()}`,
    issuerPublicKey: lender,
    assetCode: ASSET_CODE,
    assetIssuer: lender,
  });

  const added = await request.post(`${apiUrl}/api/v1/communities/${community.id}/members`, {
    headers: bearer(lenderToken),
    data: { stellarAddress: borrower },
  });
  expect(added.status()).toBe(201);

  // The loan-to-value check reads the borrower's community-token balance.
  const funded = await request.put(`${HORIZON_URL}/_e2e/accounts/${borrower}`, {
    data: { balances: [{ asset_code: ASSET_CODE, asset_issuer: lender, balance: '1000' }] },
  });
  expect(funded.ok()).toBe(true);

  const requested = await request.post(`${apiUrl}/api/v1/loans/request`, {
    headers: bearer(borrowerToken),
    data: {
      communityId: community.id,
      amount: '100',
      purpose: 'Seed stock for the market garden',
      dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  expect(requested.status()).toBe(201);
  const loan = ((await requested.json()) as { data: { id: string } }).data;

  const envelopesBefore = (await submittedEnvelopes(request)).length;

  // Connect the lender's wallet where the app offers it; the grant carries
  // over to the loans page, which shows lender actions to the connected key.
  await installFreighter(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Connect Freighter' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();

  await page.goto(`/communities/${community.id}/loans`);

  const borrowerShort = `${borrower.slice(0, 6)}…${borrower.slice(-4)}`;
  const disburse = page.getByRole('button', { name: `Disburse loan ${borrowerShort}` });
  await expect(disburse).toBeVisible();
  await disburse.click();

  const dialog = page.getByRole('dialog', { name: 'Disburse Loan?' });
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/v1/loans/${loan.id}/disburse`) && res.request().method() === 'POST'
    ),
    dialog.getByRole('button', { name: 'Disburse' }).click(),
  ]);
  expect(response.status()).toBe(200);

  await expect(
    page.getByRole('button', { name: `Mark loan ${borrowerShort} as defaulted` })
  ).toBeVisible();

  // The backend sent one escrow transaction and recorded its claimable balance.
  expect((await submittedEnvelopes(request)).length).toBe(envelopesBefore + 1);
  const stored = await request.get(`${apiUrl}/api/v1/loans/${loan.id}`, {
    headers: bearer(lenderToken),
  });
  const body = (await stored.json()) as { data: { status: string; escrow_balance_id: string } };
  expect(body.data.status).toBe('active');
  expect(body.data.escrow_balance_id).toMatch(/^00000000[0-9a-f]{64}$/);
});
