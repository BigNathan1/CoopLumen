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
import { withMappedHorizonError } from './errors';
import { assertAssetCode, assertPublicKey } from './validation';
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

/** Stellar amounts are fixed-point with 7 decimal places. */
const STROOPS_PER_UNIT = 10_000_000n;

/** Converts a decimal Stellar amount to stroops without going through a float. */
function toStroops(amount: string): bigint {
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(fraction.padEnd(7, '0').slice(0, 7));
}

/**
 * Subtracts two Stellar amounts in stroops. Doing this in floating point would
 * drift at the seventh decimal place, which is exactly the precision a trust
 * limit is expressed in.
 */
function subtractAmounts(minuend: string, subtrahend: string): string {
  const difference = toStroops(minuend) - toStroops(subtrahend);
  const negative = difference < 0n;
  const magnitude = negative ? -difference : difference;
  const whole = magnitude / STROOPS_PER_UNIT;
  const fraction = (magnitude % STROOPS_PER_UNIT).toString().padStart(7, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/** A single account's trust configuration for one issued asset. */
export interface TrustlineLimit {
  /** The maximum amount of the asset the account has agreed to hold. */
  limit: string;
  /** The amount currently held, for comparison against the limit. */
  balance: string;
  /** Headroom left before the limit is reached: `limit - balance`. */
  available: string;
  /** False when the issuer has frozen the line via an authorization flag. */
  isAuthorized: boolean;
}

/**
 * Returns the trust limit an account has configured for an issued asset.
 *
 * Horizon reports the limit only as part of the account's balance lines, so
 * this reads the account and picks out the matching line. The balance and the
 * remaining headroom come back alongside the limit, since a caller checking a
 * limit almost always needs to know how much of it is already used.
 *
 * @returns the trust configuration, or `null` when the account holds no
 * trustline for the asset. A missing trustline is an ordinary answer to this
 * question, not a failure, so it is not thrown.
 * @throws {StellarOperationError} when the input is invalid, the account does
 * not exist, or Horizon is unreachable.
 */
export async function getTrustlineLimit(
  publicKey: string,
  assetCode: string,
  assetIssuer: string
): Promise<TrustlineLimit | null> {
  const operation = 'getTrustlineLimit';

  assertPublicKey(operation, 'publicKey', publicKey);
  assertAssetCode(operation, 'assetCode', assetCode);
  assertPublicKey(operation, 'assetIssuer', assetIssuer);

  const logContext = { operation, publicKey, assetCode, assetIssuer };

  const account = await withMappedHorizonError(operation, logContext, () =>
    StellarService.loadAccount(publicKey)
  );

  const trustline = findTrustline(account.balances, assetCode, assetIssuer);

  if (!trustline) {
    logger.debug('No trustline found for asset', logContext);
    return null;
  }

  return {
    limit: trustline.limit,
    balance: trustline.balance,
    available: subtractAmounts(trustline.limit, trustline.balance),
    // Horizon omits the flag on assets whose issuer does not require
    // authorization, where every holder is implicitly authorized.
    isAuthorized: trustline.is_authorized ?? true,
  };
}
