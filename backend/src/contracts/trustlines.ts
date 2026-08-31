import {
  Asset,
  Horizon,
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { StellarError, withStellarErrors, withMappedHorizonError } from './errors';
import { withSequenceRetry } from './sequenceCache';
import { StellarOperationError, withMappedHorizonError } from './errors';
import {
  TRANSACTION_TIMEOUT_SECONDS,
  assertAssetCode,
  assertPublicKey,
  parseSecretKey,
} from './validation';
import { logger } from '../utils/logger';
import { assertAssetCode, assertPublicKey, parseSecretKey } from './validation';
import { logger } from '../utils/logger';

/** Seconds a built transaction stays valid before Horizon rejects it as too late. */
const TRUSTLINE_TIMEOUT_SECONDS = 30;

export interface TrustlineParams {
  accountSecret: string;
  assetCode: string;
  assetIssuer: string;
  limit?: string;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
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
 * trustline for the asset. A missing trustline is an ordinary answer to this
 * question, not a failure, so it is not thrown.
 *
 * @throws {StellarError} when the input is invalid, the account does not
 * exist, or Horizon is unreachable.
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

/**
 * Establishes a trustline so an account can hold a community token.
 * Must be called before the account can receive or hold the asset.
 */
export async function establishTrustline(params: TrustlineParams): Promise<string> {
  const { accountSecret, assetCode, assetIssuer, limit, memo, timeBounds } = params;

  const accountKeypair = Keypair.fromSecret(accountSecret);
  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, assetIssuer);

  const result = await withSequenceRetry(accountKeypair.publicKey(), async (account) => {
    const txBuilder = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: network,
    }).addOperation(
      Operation.changeTrust({
        asset,
        ...(limit !== undefined && { limit }),
      })
    );

    const builtMemo = buildMemo(memo);
    if (builtMemo) {
      txBuilder.addMemo(builtMemo);
    }

    const tx = applyTimeBounds(txBuilder, timeBounds).build();
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
 * @throws {StellarError} when the input is invalid, the trustline does not
 * exist, it still holds a balance or open liabilities, or Horizon rejects the
 * submission.
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
    throw new StellarError(
      `${operation} failed: account holds no trustline for ${assetCode}:${assetIssuer}; there is nothing to revoke.`,
      { status: 404 }
    );
  }

  if (Number(trustline.balance) > 0) {
    throw new StellarError(
      `${operation} failed: trustline still holds ${trustline.balance} ${assetCode}; transfer or burn the balance before revoking trust.`,
      { status: 409 }
    );
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
    throw new StellarError(
      `${operation} failed: trustline has open liabilities for ${assetCode} (selling ${trustline.selling_liabilities}, buying ${trustline.buying_liabilities}); cancel the outstanding offers before revoking trust.`,
      { status: 409 }
    );
  }

  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, assetIssuer);

  // Build from the cached, serialized sequence number the way establishTrustline
  // does; the account loaded above was only for the pre-flight balance checks.
  // The mapping wrapper sits outside, so a tx_bad_seq surviving the single
  // retry is still reported as BAD_SEQUENCE rather than raw.
  // retry is still reported as a StellarError rather than raw.
  const result = await withMappedHorizonError(operation, logContext, () =>
    withSequenceRetry(publicKey, async (sourceAccount) => {
      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: network,
      })
        .addOperation(Operation.changeTrust({ asset, limit: '0' }))
        .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
        .setTimeout(TRUSTLINE_TIMEOUT_SECONDS)
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

/**
 * Authorization flags an issuer can set on a trustline. Each field maps to a
 * bit Horizon reports as `SET_FLAGS` when turned on and `CLEAR_FLAGS` when
 * turned off; a field left `undefined` is not touched by the operation.
 *
 * - `authorized` — the holder may hold, send and receive the asset.
 * - `authorizedToMaintainLiabilities` — the holder may not trade the asset but
 *   keeps its existing offers and claimable balances alive. Used to freeze an
 *   account without wiping its open orders.
 * - `clawbackEnabled` — the issuer may claw the asset back from this holder.
 */
export interface TrustlineFlags {
  authorized?: boolean;
  authorizedToMaintainLiabilities?: boolean;
  clawbackEnabled?: boolean;
}

export interface SetTrustlineFlagsParams {
  /** Secret of the asset issuer; only the issuer may change trustline flags. */
  issuerSecret: string;
  /** Account whose trustline is being changed. */
  trustorPublicKey: string;
  assetCode: string;
  flags: TrustlineFlags;
}

const FLAG_NAMES = [
  'authorized',
  'authorizedToMaintainLiabilities',
  'clawbackEnabled',
] as const satisfies ReadonlyArray<keyof TrustlineFlags>;

/** Reports a caller mistake as a 400-class `StellarError` instead of an opaque SDK throw. */
function reject(action: string, detail: string): never {
  throw new StellarError(`${action} failed: ${detail}`, { status: 400 });
}

/**
 * Sets or clears the authorization flags on a holder's trustline.
 *
 * The asset issuer is the only account allowed to run this operation, so the
 * asset is derived from `issuerSecret` rather than taken as a parameter — that
 * removes a whole class of `op_malformed` failures. Flags set to `true` become
 * `SET_FLAGS`, flags set to `false` become `CLEAR_FLAGS`, and omitted flags are
 * left as they are.
 *
 * Requires `AUTH_REQUIRED` on the issuer to withhold authorization in the first
 * place, and `AUTH_REVOCABLE` to take it away again; without the latter Horizon
 * rejects the revocation with `op_cant_revoke`, which is surfaced as a message
 * saying exactly that.
 *
 * @returns The hash of the transaction Horizon accepted.
 */
export async function setTrustlineFlags(params: SetTrustlineFlagsParams): Promise<string> {
  const action = 'Trustline flag update';
  const { issuerSecret, trustorPublicKey, assetCode, flags } = params;

  let issuerKeypair: Keypair;
  try {
    issuerKeypair = Keypair.fromSecret(issuerSecret);
  } catch {
    reject(action, 'the issuer secret is not a valid Stellar secret key');
  }

  try {
    Keypair.fromPublicKey(trustorPublicKey);
  } catch {
    reject(action, 'the trustor is not a valid Stellar public key');
  }

  const issuerPublicKey = issuerKeypair.publicKey();
  if (trustorPublicKey === issuerPublicKey) {
    reject(action, 'an issuer does not hold a trustline to its own asset');
  }

  const requestedFlags = FLAG_NAMES.filter((name) => flags[name] !== undefined);
  if (requestedFlags.length === 0) {
    reject(action, 'at least one of the authorization flags must be set or cleared');
  }

  let asset: Asset;
  try {
    asset = new Asset(assetCode, issuerPublicKey);
  } catch {
    return reject(action, `${assetCode} is not a valid asset code`);
  }

  const hash = await withStellarErrors(action, async () => {
    const issuerAccount = await StellarService.loadAccount(issuerPublicKey);

    const tx = new TransactionBuilder(issuerAccount, {
      fee: BASE_FEE,
      networkPassphrase: StellarService.getNetwork(),
    })
      .addOperation(
        Operation.setTrustLineFlags({
          trustor: trustorPublicKey,
          asset,
          flags,
        })
      )
      .setTimeout(TRUSTLINE_TIMEOUT_SECONDS)
      .build();

    tx.sign(issuerKeypair);

    const result = await StellarService.submitTransaction(tx);
    return result.hash;
  });

  await invalidateBalanceCache([trustorPublicKey]);
  return hash;
}

/**
 * Grants a holder full authorization to use the asset. Convenience wrapper over
 * {@link setTrustlineFlags} for the common approve-a-member case.
 */
export async function authorizeTrustline(
  params: Omit<SetTrustlineFlagsParams, 'flags'>
): Promise<string> {
  return setTrustlineFlags({ ...params, flags: { authorized: true } });
}

/**
 * Revokes a holder's authorization. Pass `keepLiabilities` to downgrade the
 * holder to "authorized to maintain liabilities" instead, which freezes new
 * activity without cancelling their existing offers and claimable balances.
 */
export async function revokeTrustlineAuthorization(
  params: Omit<SetTrustlineFlagsParams, 'flags'> & { keepLiabilities?: boolean }
): Promise<string> {
  const { keepLiabilities = false, ...rest } = params;
  return setTrustlineFlags({
    ...rest,
    flags: { authorized: false, authorizedToMaintainLiabilities: keepLiabilities },
  });
}
