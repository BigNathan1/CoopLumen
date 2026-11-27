import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('Phase 2 P2P Lending E2E Flows', () => {
  test('#475 request loan flow persists loan request against real stack', async ({ page }) => {
    await page.goto(`${BASE_URL}/lending`, { waitUntil: 'networkidle' });

    const uniqueNote = `E2E loan request ${Date.now()}`;
    await page.getByLabel(/loan amount/i).fill('250');
    await page.getByLabel(/purpose|note/i).fill(uniqueNote);
    await page.getByRole('button', { name: /request loan|submit request/i }).click();

    await expect(page.getByText(uniqueNote)).toBeVisible();
  });
});
