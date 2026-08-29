/**
 * Manual verification script for getAssetBalance() function on Stellar testnet.
 *
 * This script can be run standalone to verify getAssetBalance() works correctly
 * against actual Stellar testnet, end-to-end.
 *
 * Usage:
 *   npx ts-node src/contracts/__tests__/verify-get-asset-balance.manual.ts
 *
 * Prerequisites:
 * 1. .env file configured with STELLAR_NETWORK=testnet
 * 2. Two funded testnet accounts (keypair secrets)
 *    - One as the issuer (will create and distribute the asset)
 *    - One as the holder (will receive the asset)
 *
 * To fund accounts, use the testnet faucet:
 *   https://friendbot.stellar.org/?addr=<PUBLIC_KEY>
 *
 * You can generate test keypairs with:
 *   const kp = Keypair.random();
 *   console.log('Public:', kp.publicKey());
 *   console.log('Secret:', kp.secret());
 */

import 'dotenv/config';
import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';
import { getAssetBalance } from '../assets';
import { establishTrustline } from '../trustlines';
import { issueAsset } from '../assets';
import { logger } from '../../utils/logger';

const ASSET_CODE = 'TBAL';
const DISTRIBUTION_AMOUNT = '750.5432100';

async function main() {
  // Verify testnet configuration
  const network = StellarService.getNetwork();
  logger.info(`Using network: ${network}`);

  // For this manual script, you would set these via environment or stdin.
  // For demonstration, we create random test keypairs.
  const issuerKeypair = Keypair.random();
  const holderKeypair = Keypair.random();

  logger.info(`
╔════════════════════════════════════════════════════════════╗
║       Stellar getAssetBalance() Verification Script       ║
╠════════════════════════════════════════════════════════════╣
║ Issuer:              ${issuerKeypair.publicKey()} ║
║ Holder:              ${holderKeypair.publicKey()} ║
║ Asset Code:          ${ASSET_CODE}                               ║
║ Distribution Amount: ${DISTRIBUTION_AMOUNT}                    ║
╚════════════════════════════════════════════════════════════╝

STEP 1: Fund the issuer and holder accounts on testnet faucet:
  Issuer: https://friendbot.stellar.org/?addr=${issuerKeypair.publicKey()}
  Holder: https://friendbot.stellar.org/?addr=${holderKeypair.publicKey()}

After funding, this script will proceed with the verification.
  `);

  try {
    // Step 1: Verify accounts are funded
    logger.info('[1/5] Verifying issuer account is funded...');
    let issuerAccount = await StellarService.loadAccount(issuerKeypair.publicKey());
    const issuerXlmBalance = issuerAccount.balances.find((b) => b.asset_type === 'native');
    logger.info(`  ✓ Issuer funded with ${issuerXlmBalance?.balance} XLM`);

    logger.info('[1/5] Verifying holder account is funded...');
    let holderAccount = await StellarService.loadAccount(holderKeypair.publicKey());
    const holderXlmBalance = holderAccount.balances.find((b) => b.asset_type === 'native');
    logger.info(`  ✓ Holder funded with ${holderXlmBalance?.balance} XLM`);

    // Step 2: Establish trustline for holder
    logger.info('[2/5] Establishing trustline for holder...');
    const trustlineTxHash = await establishTrustline({
      accountSecret: holderKeypair.secret(),
      assetCode: ASSET_CODE,
      assetIssuer: issuerKeypair.publicKey(),
    });
    logger.info(`  ✓ Trustline established: ${trustlineTxHash}`);

    // Step 3: Verify balance is 0 before distribution
    logger.info('[3/5] Verifying balance is 0 before distribution...');
    let balance = await getAssetBalance(
      holderKeypair.publicKey(),
      ASSET_CODE,
      issuerKeypair.publicKey()
    );
    logger.info(`  ✓ Pre-distribution balance: ${balance} (expected 0)`);
    if (balance !== 0) {
      throw new Error(`Expected 0 balance before distribution, got ${balance}`);
    }

    // Step 4: Issue and distribute asset
    logger.info('[4/5] Issuing asset to holder...');
    const issueTxHash = await issueAsset({
      issuerSecret: issuerKeypair.secret(),
      assetCode: ASSET_CODE,
      distributorPublicKey: holderKeypair.publicKey(),
      amount: DISTRIBUTION_AMOUNT,
      memo: 'Manual verification distribution',
    });
    logger.info(`  ✓ Asset issued: ${issueTxHash}`);

    // Step 5: Verify balance matches distribution amount
    logger.info('[5/5] Verifying final balance...');
    balance = await getAssetBalance(
      holderKeypair.publicKey(),
      ASSET_CODE,
      issuerKeypair.publicKey()
    );
    logger.info(`  ✓ Post-distribution balance: ${balance}`);

    const expectedBalance = Number(DISTRIBUTION_AMOUNT);
    if (balance !== expectedBalance) {
      throw new Error(`Expected ${expectedBalance}, got ${balance}`);
    }

    logger.info(`
╔════════════════════════════════════════════════════════════╗
║      ✓ Verification Complete - All Steps Passed!           ║
╚════════════════════════════════════════════════════════════╝

Summary:
- Issuer: ${issuerKeypair.publicKey()}
- Holder: ${holderKeypair.publicKey()}
- Asset: ${ASSET_CODE}
- Distribution Amount: ${DISTRIBUTION_AMOUNT}
- Final Balance: ${balance}

getAssetBalance() correctly returns the numeric asset balance!
    `);
  } catch (error) {
    logger.error('Verification failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
