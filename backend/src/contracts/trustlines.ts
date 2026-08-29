import { Asset, Keypair, TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { StellarError, withStellarErrors } from './errors';
import { withSequenceRetry } from './sequenceCache';

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
