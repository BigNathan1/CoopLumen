import {
  Asset,
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Memo,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { invalidateBalanceCache } from '../cache/balances';
import { withSequenceRetry } from './sequenceCache';
import { invalidInput, withMappedHorizonError } from './errors';
import {
  TRANSACTION_TIMEOUT_SECONDS,
  assertAssetCode,
  assertMemoLength,
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
  memo?: string;
}

export interface BurnAssetParams {
  holderSecret: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
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
  const { issuerSecret, assetCode, distributorPublicKey, amount, memo } = params;

  const issuerKeypair = parseSecretKey(operation, 'issuerSecret', issuerSecret);
  assertAssetCode(operation, 'assetCode', assetCode);
  assertPublicKey(operation, 'distributorPublicKey', distributorPublicKey);
  assertPositiveAmount(operation, 'amount', amount);
  assertMemoLength(operation, memo);

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
 * Every failure surfaces as a `StellarOperationError` carrying a stable code,
 * an actionable message, and the HTTP status a route handler should answer
 * with — Horizon result codes are never re-thrown raw. Logs record the public
 * identifiers of each attempt; the issuer secret is never logged.
 *
 * @throws {StellarOperationError} on invalid input or any Horizon failure.
 */
export async function issueAsset(params: IssueAssetParams): Promise<string> {
  const operation = 'issueAsset';
  const { assetCode, distributorPublicKey, amount, memo } = params;

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

  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, issuerPublicKey);

  // withSequenceRetry supplies the cached Account (so concurrent issuances for
  // the same issuer get distinct sequence numbers) and retries once on
  // tx_bad_seq. The mapping wrapper sits outside it, so a failure that survives
  // that retry is still reported as a StellarOperationError rather than raw.
  const result = await withMappedHorizonError(operation, logContext, () =>
    withSequenceRetry(issuerPublicKey, async (issuerAccount) => {
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

      const tx = txBuilder.setTimeout(TRANSACTION_TIMEOUT_SECONDS).build();
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

/**
 * Burns tokens by sending them back to the issuing account. Stellar assets
 * held by their own issuer are not part of circulating supply, so a payment
 * to the issuer permanently reduces total supply (the issuer never resends it).
 */
export async function burnAsset(params: BurnAssetParams): Promise<string> {
  const { holderSecret, assetCode, assetIssuer, amount } = params;

  const holderKeypair = Keypair.fromSecret(holderSecret);
  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, assetIssuer);

  const result = await withSequenceRetry(holderKeypair.publicKey(), async (holderAccount) => {
    const tx = new TransactionBuilder(holderAccount, {
      fee: BASE_FEE,
      networkPassphrase: network,
    })
      .addOperation(
        Operation.payment({
          destination: assetIssuer,
          asset,
          amount,
        })
      )
      .setTimeout(30)
      .build();

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

/** Returns the circulating supply reported by Horizon for an issued asset. */
export async function getAssetSupply(assetCode: string, assetIssuer: string): Promise<string> {
  const server = StellarService.getServer();
  const page = await StellarService.call('assets.forCode', () =>
    server.assets().forCode(assetCode).forIssuer(assetIssuer).limit(1).call()
  );

  return page.records[0]?.amount ?? '0.0000000';
}
