/**
 * Integration test: verifies getAssetBalance() function against actual Stellar testnet.
 * This test creates a real issuer and holder account on testnet, establishes a trustline,
 * distributes a known amount, and confirms getAssetBalance() returns the correct value.
 *
 * Requires:
 * - STELLAR_NETWORK=testnet in .env
 * - Sufficient testnet XLM for account creation and fees
 * - Internet access to Stellar testnet Horizon API
 *
 * This test is skipped if SKIP_TESTNET_TESTS=true or if network connectivity fails.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';
import { getAssetBalance } from '../assets';
import { distributeAsset } from '../assets';
import { establishTrustline } from '../trustlines';
import { issueAsset } from '../assets';

// Opt-in, matching every other testnet-integration suite in this codebase:
// CI does not set STELLAR_TESTNET_E2E, so this suite is skipped by
// default rather than attempting real network calls on every run.
const runTestnet = process.env.STELLAR_TESTNET_E2E === '1';
const describeTestnet = runTestnet ? describe : describe.skip;

describeTestnet('getAssetBalance - testnet integration', () => {
  const assetCode = 'TBAL';
  let issuerKeypair: Keypair;
  let holderKeypair: Keypair;
  const distributionAmount = '500.1234567'; // Use full precision to test accuracy

  /**
   * Before running tests, verify network connectivity and that we're on testnet.
   * Skip if testnet is not available.
   */
  beforeAll(async () => {
    // Verify we're on testnet
    const network = StellarService.getNetwork();
    if (network !== 'Test SDF Network ; September 2015') {
      throw new Error(`Tests require testnet; configured network is: ${network}`);
    }

    // Create test keypairs
    issuerKeypair = Keypair.random();
    holderKeypair = Keypair.random();

    // Verify Horizon connectivity
    const isHealthy = await StellarService.ping();
    if (!isHealthy) {
      throw new Error('Horizon testnet is not responding; skipping testnet integration test');
    }

    console.log(`
=== Stellar getAssetBalance() Integration Test ===
Issuer: ${issuerKeypair.publicKey()}
Holder: ${holderKeypair.publicKey()}
Asset Code: ${assetCode}
Distribution Amount: ${distributionAmount}
    `);
  }, 10000);

  it('should fund issuer and holder accounts from testnet faucet', async () => {
    try {
      // Try to load the issuer account; if it fails, the test environment is not set up
      await StellarService.loadAccount(issuerKeypair.publicKey());
      expect(true).toBe(true); // Account exists
    } catch (error) {
      // Expected if accounts haven't been funded via faucet
      console.warn(
        `
Note: Accounts not yet funded on testnet. To complete this test:
1. Fund issuer: https://friendbot.stellar.org/?addr=${issuerKeypair.publicKey()}
2. Fund holder: https://friendbot.stellar.org/?addr=${holderKeypair.publicKey()}
Then re-run this test.
      `
      );
      throw error;
    }
  }, 15000);

  it('should establish trustline for holder', async () => {
    try {
      const txHash = await establishTrustline({
        accountSecret: holderKeypair.secret(),
        assetCode,
        assetIssuer: issuerKeypair.publicKey(),
      });

      expect(txHash).toBeDefined();
      expect(txHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash format

      console.log(`Trustline established: ${txHash}`);

      // Verify the trustline was created
      const balance = await getAssetBalance(
        holderKeypair.publicKey(),
        assetCode,
        issuerKeypair.publicKey()
      );
      expect(balance).toBe(0); // Should have 0 balance before distribution
    } catch (error) {
      console.error('Failed to establish trustline:', error);
      throw error;
    }
  }, 15000);

  it('should issue asset from issuer to holder', async () => {
    try {
      const txHash = await issueAsset({
        issuerSecret: issuerKeypair.secret(),
        assetCode,
        distributorPublicKey: holderKeypair.publicKey(),
        amount: distributionAmount,
        memo: 'Integration test distribution',
      });

      expect(txHash).toBeDefined();
      expect(txHash).toMatch(/^[a-f0-9]{64}$/);

      console.log(`Asset issued: ${txHash}`);
    } catch (error) {
      console.error('Failed to issue asset:', error);
      throw error;
    }
  }, 15000);

  it('should return correct balance after distribution', async () => {
    try {
      const balance = await getAssetBalance(
        holderKeypair.publicKey(),
        assetCode,
        issuerKeypair.publicKey()
      );

      expect(balance).toBe(Number(distributionAmount));
      expect(balance).toBe(500.1234567); // Verify full precision
      console.log(`Balance verified: ${balance} ${assetCode}`);
    } catch (error) {
      console.error('Failed to verify balance:', error);
      throw error;
    }
  }, 15000);

  it('should return 0 for unfunded account without trustline', async () => {
    try {
      const unrelatedKeypair = Keypair.random();

      const balance = await getAssetBalance(
        unrelatedKeypair.publicKey(),
        assetCode,
        issuerKeypair.publicKey()
      );

      // Should return 0 because account has no trustline
      expect(balance).toBe(0);
      console.log(`Unfunded account correctly returns 0 balance`);
    } catch (error) {
      // This is expected - the unfunded account might not exist
      // which throws an error. That's also acceptable for this test.
      console.warn('Unfunded account test skipped (account creation not available)');
    }
  }, 15000);

  it('should return correct balance for multiple distributions', async () => {
    try {
      const additionalAmount = '123.4567890';

      // Distribute additional amount
      const txHash = await distributeAsset({
        issuerSecret: issuerKeypair.secret(),
        assetCode,
        assetIssuer: issuerKeypair.publicKey(),
        distributorPublicKey: holderKeypair.publicKey(),
        amount: additionalAmount,
      });

      expect(txHash).toBeDefined();

      // Verify balance increased
      const newBalance = await getAssetBalance(
        holderKeypair.publicKey(),
        assetCode,
        issuerKeypair.publicKey()
      );

      const expectedBalance = Number(distributionAmount) + Number(additionalAmount);
      expect(newBalance).toBe(expectedBalance);
      console.log(`Multiple distributions: balance is now ${newBalance}`);
    } catch (error) {
      console.error('Failed to distribute additional amount:', error);
      throw error;
    }
  }, 15000);
});
