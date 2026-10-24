import { test, expect } from '@playwright/test';

const MOCK_PUBLIC_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQ';
const NEW_MEMBER_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNNEW';

test.describe('Add Member to Community Flow', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Inject mock Freighter wallet for headless authentication
    await page.addInitScript((publicKey) => {
      const mockFreighter = {
        isConnected: async () => true,
        getPublicKey: async () => publicKey,
        signTransaction: async (xdr: string) => xdr,
        signAuthEntry: async (entry: string) => entry,
      };
      
      (window as any).freighter = mockFreighter;
      (window as any).freighterApi = mockFreighter;
    }, MOCK_PUBLIC_KEY);

    // 2. Establish authenticated session
    await page.goto('/');
    const connectButton = page.getByRole('button', { name: /connect wallet/i });
    if (await connectButton.isVisible()) {
      await connectButton.click();
      await expect(page.getByRole('button', { name: /disconnect/i })).toBeVisible();
    }
  });

  test('successfully adds a member to a community and updates the list', async ({ page }) => {
    // Step 1: Create an isolated community for this test run
    await page.goto('/communities/create');
    const uniqueCommunityName = `E2E Member Test ${Date.now()}`;
    await page.getByLabel(/community name/i).fill(uniqueCommunityName);
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/communities\/.+/);

    // Step 2: Navigate to the Members management view
    await page.getByRole('link', { name: /members/i }).click();
    
    // Step 3: Trigger the Add Member action
    await page.getByRole('button', { name: /add member/i }).click();
    
    // Step 4: Fill the member details (adjust label regex based on actual UI)
    await page.getByLabel(/public key|stellar address/i).fill(NEW_MEMBER_KEY);
    await page.getByRole('button', { name: /submit|add/i, exact: true }).click();

    // Step 5: Verify the real backend processed the addition and the UI reflects it
    // Wait for the truncated or full key to appear in the members list
    const truncatedKey = `${NEW_MEMBER_KEY.slice(0, 4)}...${NEW_MEMBER_KEY.slice(-4)}`;
    const memberEntry = page.getByText(new RegExp(`${NEW_MEMBER_KEY}|${truncatedKey}`));
    
    await expect(memberEntry.first()).toBeVisible({ timeout: 10000 });
  });
});