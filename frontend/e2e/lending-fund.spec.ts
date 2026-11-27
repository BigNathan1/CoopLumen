import { expect, test } from './support/fixtures';

// Funding cannot run against the CI stack yet. A loan request first passes the
// loan-to-value check, which reads the borrower's community-token balance from
// Horizon, and the test member holds no tokens there. Disbursing then submits a
// real claimable-balance transaction, which needs a funded ESCROW_SOURCE_SECRET.
// Until the E2E stack can stub Horizon, this stays a known gap rather than a
// test that fails on every run.
test.fixme('a lender disburses a pending pool loan into escrow', async ({
  authenticatedPage: page,
}) => {
  await page.goto('/communities');
  await expect(page.getByRole('button', { name: 'Disburse' })).toBeVisible();
});
