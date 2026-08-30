import { Asset, Keypair, TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { withSequenceRetry } from './sequenceCache';

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
 * Issues a new community token on the Stellar network.
 * The issuer account creates the asset and sends initial supply to a distributor.
 */
export async function issueAsset(params: IssueAssetParams): Promise<string> {
  const { issuerSecret, assetCode, distributorPublicKey, amount, memo, timeBounds } = params;

  const issuerKeypair = Keypair.fromSecret(issuerSecret);
  const network = StellarService.getNetwork();
  const asset = new Asset(assetCode, issuerKeypair.publicKey());

  const result = await withSequenceRetry(issuerKeypair.publicKey(), async (issuerAccount) => {
    const txBuilder = new TransactionBuilder(issuerAccount, {
      fee: BASE_FEE,
      networkPassphrase: network,
    });

    const builtMemo = buildMemo(memo);
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

    const tx = applyTimeBounds(txBuilder, timeBounds).build();
    tx.sign(issuerKeypair);

    return StellarService.submitTransaction(tx);
  });

  await invalidateBalanceCache([issuerKeypair.publicKey(), distributorPublicKey]);
  return result.hash;
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

/** Returns the circulating supply reported by Horizon for an issued asset. */
export async function getAssetSupply(assetCode: string, assetIssuer: string): Promise<string> {
/** Returns the total supply Horizon's asset stats endpoint reports for an issued asset. */
export async function getTotalSupply(assetCode: string, issuer: string): Promise<string> {
  const server = StellarService.getServer();
  const page = await StellarService.call('assets.forCode', () =>
    server.assets().forCode(assetCode).forIssuer(issuer).limit(1).call()
  );

  return page.records[0]?.amount ?? '0.0000000';
}
