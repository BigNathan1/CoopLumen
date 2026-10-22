import { test, expect } from '@playwright/test';

const MOCK_PUBLIC_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQ';

test.describe('Issue Community Token Flow', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Inject mock Freighter wallet to simulate authentication and transaction signing
    await page.addInitScript((publicKey) => {
      const mockFreighter = {
        isConnected: async () => true,
        getPublicKey: async () => publicKey,
        // Mock Stellar signing by intercepting the XDR and returning a simulated signed payload.
        // If the backend strictly validates signatures on the testnet, this mock will need 
        // to be expanded to use stellar-sdk to genuinely sign with a funded test keypair.
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

  test('successfully fills token details, simulates signing, and issues token', async ({ page }) => {
    // Step 1: Create an isolated community for the token issuance
    await page.goto('/communities/create');
    const uniqueCommunityName = `Token Test Community ${Date.now()}`;
    await page.getByLabel(/community name/i).fill(uniqueCommunityName);
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/communities\/.+/);

    // Step 2: Navigate to the Token Management/Issuance view
    // Adjust the accessible name regex based on your actual sidebar/navigation labels
    await page.getByRole('link', { name: /token|issue/i }).click();
    
    // Step 3: Fill the token issuance form
    await page.getByLabel(/token name/i).fill('Community Lumen');
    await page.getByLabel(/token symbol/i).fill('CLUM');
    await page.getByLabel(/initial supply/i).fill('1000000');
    
    // Step 4: Trigger the issuance transaction
    // This will invoke the mocked `signTransaction` injected in beforeEach
    await page.getByRole('button', { name: /issue token|submit/i }).click();

    // Step 5: Verify the real backend processed the token creation and UI updated
    const successMessage = page.getByText(/token issued successfully|token created/i);
    await expect(successMessage).toBeVisible({ timeout: 15000 });
    
    // Verify the newly issued token symbol renders in the community view
    await expect(page.getByText('CLUM')).toBeVisible();
  });
});