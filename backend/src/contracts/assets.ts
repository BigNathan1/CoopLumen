import {
  Asset,
  Keypair,
  Memo,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds, resolveTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { withSequenceRetry } from './sequenceCache';
import { invalidInput, withMappedHorizonError } from './errors';
import {
  assertAssetCode,
  assertPositiveAmount,
  assertPublicKey,
  parseSecretKey,
} from './validation';
import { logger } from '../utils/logger';

export interface IssueAssetParams {
  issuerSecret: string;
  assetCode: string;
  distributorPublicKey: string;
  amount: string;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

export interface BurnAssetParams {
  holderSecret: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

export interface DistributeAssetParams {
  issuerSecret: string;
  assetCode: string;
  assetIssuer: string;
  distributorPublicKey: string;
  amount: string;
  memo?: string;
}

export interface AssetHolder {
  account: string;
  balance: string;
}

/**
 * Validates issuance parameters before any network call, so a typo costs a
 * clear 400 instead of a Horizon round trip and an opaque `op_malformed`.
 * Returns the issuer keypair, which the caller needs anyway.
 */
function parseIssueAssetParams(params: IssueAssetParams): Keypair {
  const operation = 'issueAsset';
  const { issuerSecret, assetCode, distributorPublicKey, amount } = params;

  const issuerKeypair = parseSecretKey(operation, 'issuerSecret', issuerSecret);
  assertAssetCode(operation, 'assetCode', assetCode);
  assertPublicKey(operation, 'distributorPublicKey', distributorPublicKey);
  assertPositiveAmount(operation, 'amount', amount);

  if (distributorPublicKey === issuerKeypair.publicKey()) {
    throw invalidInput(
      operation,
      'distributorPublicKey must differ from the issuing account; an issuer paying itself creates no supply.'
    );
  }

  return issuerKeypair;
}

/**
 * Issues a new community token on the Stellar network.
 * The issuer account creates the asset and sends initial supply to a distributor.
 *
 * Every failure surfaces as a `StellarError` carrying an actionable message
 * and the HTTP status a route handler should answer with — Horizon result
 * codes are never re-thrown raw. Logs record the public identifiers of each
 * attempt; the issuer secret is never logged.
 */
export async function issueAsset(params: IssueAssetParams): Promise<string> {
  const operation = 'issueAsset';
  const { assetCode, distributorPublicKey, amount, memo, timeBounds } = params;

  const issuerKeypair = parseIssueAssetParams(params);
  const issuerPublicKey = issuerKeypair.publicKey();
  const logContext = {
    operation,
    assetCode,
    issuerPublicKey,
    distributorPublicKey,
    amount,
    hasMemo: memo !== undefined,
  };

  logger.info('Issuing community token', logContext);

  // Resolved before the wrapper below so a malformed memo or an already-elapsed
  // time window fails as its own specific error, not a generic mapped one.
  const builtMemo = buildMemo(memo);
  const resolvedBounds = resolveTimeBounds(timeBounds);

  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, issuerPublicKey);

  // withSequenceRetry supplies the cached Account (so concurrent issuances for
  // the same issuer get distinct sequence numbers) and retries once on
  // tx_bad_seq. The mapping wrapper sits outside it, so a failure that survives
  // that retry is still reported as a StellarError rather than raw.
  const result = await withMappedHorizonError(operation, logContext, () =>
    withSequenceRetry(issuerPublicKey, async (issuerAccount) => {
      const txBuilder = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE,
        networkPassphrase: network,
      });

      if (builtMemo) {
        txBuilder.addMemo(builtMemo);
      }

      txBuilder.addOperation(
        Operation.payment({
          destination: distributorPublicKey,
          asset,
          amount,
        })
      );

      const tx = txBuilder.setTimebounds(resolvedBounds.minTime, resolvedBounds.maxTime).build();
      tx.sign(issuerKeypair);

      return StellarService.submitTransaction(tx);
    })
  );

  logger.info('Community token issued', {
    ...logContext,
    txHash: result.hash,
    ledger: result.ledger,
  });

  // The tokens are already on-chain at this point. A cache eviction failure
  // must not turn a successful issuance into an error the caller may retry,
  // so it is logged and swallowed; the entries expire on their own TTL.
  try {
    await invalidateBalanceCache([issuerPublicKey, distributorPublicKey]);
  } catch (error) {
    logger.warn('Balance cache invalidation failed after issuance', {
      ...logContext,
      txHash: result.hash,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return result.hash;
}

export interface BuildUnsignedIssueAssetParams {
  issuerPublicKey: string;
  assetCode: string;
  distributorPublicKey: string;
  amount: string;
  memo?: MemoInput;
}

/**
 * Builds an unsigned XDR transaction for issuing a community token, for
 * client-side signing via Freighter. Mirrors issueAsset's transaction shape —
 * a payment of newly-issued supply from the issuer to the distributor — but
 * takes the issuer's public key instead of its secret, so the secret never
 * reaches the server. Sign the returned XDR with the issuer's wallet and
 * submit it through POST /api/v1/tokens/submit.
 */
export async function buildUnsignedIssueAsset(
  params: BuildUnsignedIssueAssetParams
): Promise<string> {
  const { issuerPublicKey, assetCode, distributorPublicKey, amount, memo } = params;

  const network = StellarService.getNetwork();
  const account = await StellarService.loadAccount(issuerPublicKey);
  const asset = new Asset(assetCode, issuerPublicKey);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  }).addOperation(
    Operation.payment({
      destination: distributorPublicKey,
      asset,
      amount,
    })
  );

  const builtMemo = buildMemo(memo);
  if (builtMemo) {
    txBuilder.addMemo(builtMemo);
  }

  return txBuilder.setTimeout(30).build().toXDR();
}

/**
 * Distributes tokens from the issuer to a distributor or holder account.
 * The destination account must already have a trustline for the asset.
 * If the trustline doesn't exist, the transaction will fail with op_no_trust.
 *
 * @param params Distribution parameters including issuer secret, asset details, destination, and amount
 * @returns Transaction hash of the distribution
 * @throws Horizon errors (e.g., op_no_trust, op_underfunded) for callers to map
 */
export async function distributeAsset(params: DistributeAssetParams): Promise<string> {
  const { issuerSecret, assetCode, assetIssuer, distributorPublicKey, amount, memo } = params;

  const issuerKeypair = Keypair.fromSecret(issuerSecret);
  const network = StellarService.getNetwork();

  const issuerAccount = await StellarService.loadAccount(issuerKeypair.publicKey());
  const asset = new Asset(assetCode, assetIssuer);

  const txBuilder = new TransactionBuilder(issuerAccount, {
    fee: BASE_FEE,
    networkPassphrase: network,
  });

  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  }

  txBuilder.addOperation(
    Operation.payment({
      destination: distributorPublicKey,
      asset,
      amount,
    })
  );

  const tx = txBuilder.setTimeout(30).build();
  tx.sign(issuerKeypair);

  const result = await StellarService.submitTransaction(tx);
  await invalidateBalanceCache([issuerKeypair.publicKey(), distributorPublicKey]);
  return result.hash;
}

/**
 * Burns tokens by sending them back to the issuing account. Stellar assets
 * held by their own issuer are not part of circulating supply, so a payment
 * to the issuer permanently reduces total supply (the issuer never resends it).
 */
export async function burnAsset(params: BurnAssetParams): Promise<string> {
  const { holderSecret, assetCode, assetIssuer, amount, memo, timeBounds } = params;

  const holderKeypair = Keypair.fromSecret(holderSecret);
  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, assetIssuer);

  const result = await withSequenceRetry(holderKeypair.publicKey(), async (holderAccount) => {
    const txBuilder = new TransactionBuilder(holderAccount, {
      fee: BASE_FEE,
      networkPassphrase: network,
    }).addOperation(
      Operation.payment({
        destination: assetIssuer,
        asset,
        amount,
      })
    );

    const builtMemo = buildMemo(memo);
    if (builtMemo) {
      txBuilder.addMemo(builtMemo);
    }

    const tx = applyTimeBounds(txBuilder, timeBounds).build();
    tx.sign(holderKeypair);
    return StellarService.submitTransaction(tx);
  });

  await invalidateBalanceCache([holderKeypair.publicKey(), assetIssuer]);
  return result.hash;
}

/** Lists accounts holding a given asset by querying Horizon's asset endpoint. */
export async function getAssetHolders(
  assetCode: string,
  assetIssuer: string
): Promise<AssetHolder[]> {
  const server = StellarService.getServer();
  const asset = new Asset(assetCode, assetIssuer);

  const holders: AssetHolder[] = [];
  let page = await StellarService.call('accounts.forAsset', () =>
    server.accounts().forAsset(asset).limit(200).call()
  );

  while (page.records.length > 0) {
    for (const account of page.records) {
      const balanceLine = account.balances.find(
        (b) =>
          b.asset_type !== 'native' &&
          'asset_code' in b &&
          b.asset_code === assetCode &&
          b.asset_issuer === assetIssuer
      );
      if (balanceLine) {
        holders.push({ account: account.account_id, balance: balanceLine.balance });
      }
    }
    if (page.records.length < 200) break;
    page = await StellarService.call('accounts.forAsset.next', () => page.next());
  }

  return holders;
}

/**
 * Returns the numeric balance of an asset held by a given account.
 * If the account has no trustline for the asset, returns 0.
 * If the account doesn't exist, throws an error.
 *
 * @param publicKey Account public key
 * @param assetCode Asset code (e.g., "ECO")
 * @param issuer Issuer's public key
 * @returns Numeric balance, or 0 if no trustline exists
 * @throws Error if account not found or network error (propagates to route handler for mapping)
 */
export async function getAssetBalance(
  publicKey: string,
  assetCode: string,
  issuer: string
): Promise<number> {
  const account = await StellarService.loadAccount(publicKey);

  // Find the balance entry for the given asset
  const balanceEntry = account.balances.find(
    (b) =>
      b.asset_type !== 'native' &&
      'asset_code' in b &&
      b.asset_code === assetCode &&
      b.asset_issuer === issuer
  );

  // No trustline means 0 balance
  if (!balanceEntry) {
    return 0;
  }

  // Convert Horizon's string balance to number
  return Number(balanceEntry.balance);
}

/** Returns the total supply Horizon's asset stats endpoint reports for an issued asset. */
export async function getTotalSupply(assetCode: string, issuer: string): Promise<string> {
  const server = StellarService.getServer();
  const page = await StellarService.call('assets.forCode', () =>
    server.assets().forCode(assetCode).forIssuer(issuer).limit(1).call()
  );

  return page.records[0]?.amount ?? '0.0000000';
}
