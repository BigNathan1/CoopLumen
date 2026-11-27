import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('Phase 2 P2P Lending E2E Flows', () => {
  test('#476 fund loan flow funds an open request via escrow against real stack', async ({ page }) => {
    await page.goto(`${BASE_URL}/lending`, { waitUntil: 'networkidle' });

    const fundableRow = page.locator('[data-testid="loan-item"], tr').filter({ hasText: /requested|open/i }).first();
    await expect(fundableRow).toBeVisible();

    await fundableRow.getByRole('button', { name: /fund loan|fund/i }).click();
    const confirmBtn = page.getByRole('button', { name: /confirm|approve/i });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(fundableRow).toContainText(/funded|active/i);
  });
});