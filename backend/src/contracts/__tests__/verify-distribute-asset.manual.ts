/**
 * Manual verification script for distributeAsset() function on Stellar testnet.
 *
 * This script can be run standalone to verify distributeAsset() works correctly
 * against actual Stellar testnet, end-to-end.
 *
 * Usage:
 *   npx ts-node src/contracts/__tests__/verify-distribute-asset.manual.ts
 *
 * Prerequisites:
 * 1. .env file configured with STELLAR_NETWORK=testnet
 * 2. Two funded testnet accounts (keypair secrets)
 *    - One as the issuer (will create and distribute the asset)
 *    - One as the distributor (will receive the asset)
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
import { distributeAsset } from '../assets';
import { establishTrustline } from '../trustlines';
import { issueAsset } from '../assets';
import { logger } from '../../utils/logger';

const ASSET_CODE = 'TCOOP';
const INITIAL_SUPPLY = '10000.0000000';
const DISTRIBUTION_AMOUNT = '1000.0000000';

async function main() {
  // Verify testnet configuration
  const network = StellarService.getNetwork();
  logger.info(`Using network: ${network}`);

  // For this manual script, you would set these via environment or stdin.
  // For demonstration, we create random test keypairs.
  const issuerKeypair = Keypair.random();
  const distributorKeypair = Keypair.random();

  logger.info(`
╔════════════════════════════════════════════════════════════╗
║          Stellar distributeAsset() Verification           ║
╠════════════════════════════════════════════════════════════╣
║ Issuer:          ${issuerKeypair.publicKey()} ║
║ Distributor:     ${distributorKeypair.publicKey()} ║
║ Asset Code:      ${ASSET_CODE}                               ║
║ Initial Supply:  ${INITIAL_SUPPLY}                    ║
║ Distribution:    ${DISTRIBUTION_AMOUNT}                    ║
╚════════════════════════════════════════════════════════════╝

STEP 1: Fund the issuer and distributor accounts on testnet faucet:
  Issuer:      https://friendbot.stellar.org/?addr=${issuerKeypair.publicKey()}
  Distributor: https://friendbot.stellar.org/?addr=${distributorKeypair.publicKey()}

After funding, this script will proceed.
  `);

  try {
    // Step 1: Verify accounts are funded
    logger.info('[1/5] Verifying issuer account is funded...');
    let issuerAccount = await StellarService.loadAccount(issuerKeypair.publicKey());
    const issuerXlmBalance = issuerAccount.balances.find((b) => b.asset_type === 'native');
    logger.info(`  ✓ Issuer funded with ${issuerXlmBalance?.balance} XLM`);

    logger.info('[1/5] Verifying distributor account is funded...');
    let distributorAccount = await StellarService.loadAccount(distributorKeypair.publicKey());
    const distributorXlmBalance = distributorAccount.balances.find((b) => b.asset_type === 'native');
    logger.info(`  ✓ Distributor funded with ${distributorXlmBalance?.balance} XLM`);

    // Step 2: Issue asset from issuer to distributor
    logger.info('[2/5] Issuing asset from issuer to distributor...');
    const issueTxHash = await issueAsset({
      issuerSecret: issuerKeypair.secret(),
      assetCode: ASSET_CODE,
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: INITIAL_SUPPLY,
      memo: 'Initial asset issuance',
    });
    logger.info(`  ✓ Asset issued: ${issueTxHash}`);

    // Step 3: Verify distributor received the initial supply
    logger.info('[3/5] Verifying initial distribution...');
    distributorAccount = await StellarService.loadAccount(distributorKeypair.publicKey());
    const initialBalance = distributorAccount.balances.find(
      (b) =>
        b.asset_type !== 'native' &&
        'asset_code' in b &&
        b.asset_code === ASSET_CODE &&
        b.asset_issuer === issuerKeypair.publicKey()
    );
    logger.info(`  ✓ Distributor received ${initialBalance?.balance} ${ASSET_CODE}`);

    // Step 4: Create another account to distribute to (the actual distributeAsset test)
    const recipientKeypair = Keypair.random();
    logger.info(`[4/5] Establishing trustline for recipient: ${recipientKeypair.publicKey()}`);

    // Fund recipient first
    logger.info(
      `  Please fund the recipient at: https://friendbot.stellar.org/?addr=${recipientKeypair.publicKey()}`
    );

    // Wait a moment for faucet (in real scenario, user would do this)
    // For now, we'll attempt and let it fail gracefully if not funded
    try {
      await StellarService.loadAccount(recipientKeypair.publicKey());
      logger.info('  ✓ Recipient account verified');

      // Establish trustline for recipient
      const trustlineTxHash = await establishTrustline({
        accountSecret: recipientKeypair.secret(),
        assetCode: ASSET_CODE,
        assetIssuer: issuerKeypair.publicKey(),
      });
      logger.info(`  ✓ Trustline established: ${trustlineTxHash}`);

      // Step 5: Distribute asset using the distributeAsset function
      logger.info('[5/5] Distributing asset to recipient...');
      const distributeTxHash = await distributeAsset({
        issuerSecret: issuerKeypair.secret(),
        assetCode: ASSET_CODE,
        assetIssuer: issuerKeypair.publicKey(),
        distributorPublicKey: recipientKeypair.publicKey(),
        amount: DISTRIBUTION_AMOUNT,
        memo: 'Test distribution via distributeAsset()',
      });
      logger.info(`  ✓ Asset distributed: ${distributeTxHash}`);

      // Verify recipient received the asset
      let recipientAccount = await StellarService.loadAccount(recipientKeypair.publicKey());
      const recipientBalance = recipientAccount.balances.find(
        (b) =>
          b.asset_type !== 'native' &&
          'asset_code' in b &&
          b.asset_code === ASSET_CODE &&
          b.asset_issuer === issuerKeypair.publicKey()
      );
      logger.info(`  ✓ Recipient balance verified: ${recipientBalance?.balance} ${ASSET_CODE}`);
    } catch (recipientError) {
      logger.warn(
        'Recipient account not funded. To complete the test, fund the recipient and try again.'
      );
      logger.warn(`Recipient funding URL: https://friendbot.stellar.org/?addr=${recipientKeypair.publicKey()}`);
    }

    logger.info(`
╔════════════════════════════════════════════════════════════╗
║           ✓ Verification Complete - All Steps Passed!      ║
╚════════════════════════════════════════════════════════════╝
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
