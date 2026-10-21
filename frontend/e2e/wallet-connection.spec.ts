import { test, expect } from '@playwright/test';

const MOCK_PUBLIC_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQ';

test.describe('Wallet Connection Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Inject a mock Freighter extension into the window object before the page loads.
    // This satisfies the frontend's checks for the extension and simulates user approval.
    await page.addInitScript((publicKey) => {
      const mockFreighter = {
        isConnected: async () => true,
        getPublicKey: async () => publicKey,
        signTransaction: async (xdr: string) => xdr, // Mock passthrough
        signAuthEntry: async (entry: string) => entry,
      };
      
      (window as any).freighter = mockFreighter;
      (window as any).freighterApi = mockFreighter;
    }, MOCK_PUBLIC_KEY);
  });

  test('successfully connects wallet and updates UI', async ({ page }) => {
    // 1. Navigate to the main application entry point
    await page.goto('/');

    // 2. Locate the "Connect Wallet" button
    const connectButton = page.getByRole('button', { name: /connect wallet/i });
    await expect(connectButton).toBeVisible();

    // 3. Initiate the connection flow
    await connectButton.click();

    // 4. Verify the UI updates to reflect the connected state.
    // Typically, apps show the truncated public key (e.g., GABC...OPQ) or a Disconnect button.
    const truncatedKey = `${MOCK_PUBLIC_KEY.slice(0, 4)}...${MOCK_PUBLIC_KEY.slice(-4)}`;
    const addressDisplay = page.getByText(truncatedKey);
    
    await expect(addressDisplay).toBeVisible();
    await expect(page.getByRole('button', { name: /disconnect/i })).toBeVisible();
  });
});