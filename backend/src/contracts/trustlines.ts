import {
  Asset,
  Horizon,
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { invalidateBalanceCache } from '../cache/balances';
import { withSequenceRetry } from './sequenceCache';
import { StellarOperationError, withMappedHorizonError } from './errors';
import {
  TRANSACTION_TIMEOUT_SECONDS,
  assertAssetCode,
  assertPublicKey,
  parseSecretKey,
} from './validation';
import { logger } from '../utils/logger';

export interface TrustlineParams {
  accountSecret: string;
  assetCode: string;
  assetIssuer: string;
  limit?: string;
}

export interface BuildUnsignedTrustlineParams {
  accountPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  limit?: string;
}

export interface RevokeTrustlineParams {
  accountSecret: string;
  assetCode: string;
  assetIssuer: string;
}

/** Locates the balance line for a specific issued asset, if the account trusts it. */
function findTrustline(
  balances: Horizon.HorizonApi.BalanceLine[],
  assetCode: string,
  assetIssuer: string
): Horizon.HorizonApi.BalanceLineAsset | undefined {
  return balances.find(
    (line): line is Horizon.HorizonApi.BalanceLineAsset =>
      line.asset_type !== 'native' &&
      line.asset_type !== 'liquidity_pool_shares' &&
      'asset_code' in line &&
      line.asset_code === assetCode &&
      line.asset_issuer === assetIssuer
  );
}

/**
 * Establishes a trustline so an account can hold a community token.
 * Must be called before the account can receive or hold the asset.
 */
export async function establishTrustline(params: TrustlineParams): Promise<string> {
  const { accountSecret, assetCode, assetIssuer, limit } = params;

  const accountKeypair = Keypair.fromSecret(accountSecret);
  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, assetIssuer);

  const result = await withSequenceRetry(accountKeypair.publicKey(), async (account) => {
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: network,
    })
      .addOperation(
        Operation.changeTrust({
          asset,
          ...(limit !== undefined && { limit }),
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(accountKeypair);
    return StellarService.submitTransaction(tx);
  });

  await invalidateBalanceCache([accountKeypair.publicKey()]);
  return result.hash;
}

/**
 * Builds an unsigned XDR transaction for establishing a trustline for client-side signing.
 */
export async function buildUnsignedTrustline(
  params: BuildUnsignedTrustlineParams
): Promise<string> {
  const { accountPublicKey, assetCode, assetIssuer, limit } = params;

  const network = StellarService.getNetwork();
  const account = await StellarService.loadAccount(accountPublicKey);
  const asset = new Asset(assetCode, assetIssuer);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  })
    .addOperation(
      Operation.changeTrust({
        asset,
        ...(limit !== undefined && { limit }),
      })
    )
    .setTimeout(30)
    .build();

  return tx.toXDR();
}

/**
 * Removes an account's trust for an asset by submitting a `changeTrust`
 * operation with a limit of zero, which deletes the trustline entry and
 * releases the 0.5 XLM base reserve it held.
 *
 * Stellar only deletes a trustline whose balance and liabilities are all zero.
 * Both conditions are checked against the loaded account first, so the caller
 * gets a precise message naming the leftover balance instead of Horizon's
 * `op_invalid_limit`, and no fee is spent on a submission that cannot succeed.
 *
 * @returns the hash of the submitted revocation transaction.
 * @throws {StellarOperationError} when the input is invalid, the trustline
 * does not exist, it still holds a balance or open liabilities, or Horizon
 * rejects the submission.
 */
export async function revokeTrustline(params: RevokeTrustlineParams): Promise<string> {
  const operation = 'revokeTrustline';
  const { accountSecret, assetCode, assetIssuer } = params;

  const accountKeypair = parseSecretKey(operation, 'accountSecret', accountSecret);
  assertAssetCode(operation, 'assetCode', assetCode);
  assertPublicKey(operation, 'assetIssuer', assetIssuer);

  const publicKey = accountKeypair.publicKey();
  const logContext = { operation, publicKey, assetCode, assetIssuer };

  logger.info('Revoking trustline', logContext);

  const account = await withMappedHorizonError(operation, logContext, () =>
    StellarService.loadAccount(publicKey)
  );

  const trustline = findTrustline(account.balances, assetCode, assetIssuer);

  if (!trustline) {
    throw new StellarOperationError({
      operation,
      code: 'TRUSTLINE_MISSING',
      message: `Account holds no trustline for ${assetCode}:${assetIssuer}; there is nothing to revoke.`,
      httpStatus: 404,
    });
  }

  if (Number(trustline.balance) > 0) {
    throw new StellarOperationError({
      operation,
      code: 'TRUSTLINE_HAS_BALANCE',
      message: `Trustline still holds ${trustline.balance} ${assetCode}; transfer or burn the balance before revoking trust.`,
      httpStatus: 409,
    });
  }

  // Open offers and pending liabilities keep the ledger entry alive even at a
  // zero balance, and Horizon reports that as the same op_invalid_limit.
  const sellingLiabilities = Number(trustline.selling_liabilities ?? '0');
  const buyingLiabilities = Number(trustline.buying_liabilities ?? '0');
  if (sellingLiabilities > 0 || buyingLiabilities > 0) {
    throw new StellarOperationError({
      operation,
      code: 'TRUSTLINE_HAS_BALANCE',
      message: `Trustline has open liabilities for ${assetCode} (selling ${trustline.selling_liabilities}, buying ${trustline.buying_liabilities}); cancel the outstanding offers before revoking trust.`,
      httpStatus: 409,
    });
  }

  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, assetIssuer);

  // Build from the cached, serialized sequence number the way establishTrustline
  // does; the account loaded above was only for the pre-flight balance checks.
  // The mapping wrapper sits outside, so a tx_bad_seq surviving the single
  // retry is still reported as BAD_SEQUENCE rather than raw.
  const result = await withMappedHorizonError(operation, logContext, () =>
    withSequenceRetry(publicKey, async (sourceAccount) => {
      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: network,
      })
        .addOperation(Operation.changeTrust({ asset, limit: '0' }))
        .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
        .build();

      tx.sign(accountKeypair);
      return StellarService.submitTransaction(tx);
    })
  );

  logger.info('Trustline revoked', { ...logContext, txHash: result.hash, ledger: result.ledger });

  // The trustline is already gone on-chain; a cache eviction failure must not
  // turn that into an error the caller may retry. The entries carry a TTL.
  try {
    await invalidateBalanceCache([publicKey]);
  } catch (error) {
    logger.warn('Balance cache invalidation failed after trustline revocation', {
      ...logContext,
      txHash: result.hash,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return result.hash;
}

export async function hasTrustline(
  publicKey: string,
  assetCode: string,
  assetIssuer: string
): Promise<boolean> {
  const account = await StellarService.loadAccount(publicKey);
  return account.balances.some(
    (b) =>
      b.asset_type !== 'native' &&
      'asset_code' in b &&
      b.asset_code === assetCode &&
      b.asset_issuer === assetIssuer
  );
}
