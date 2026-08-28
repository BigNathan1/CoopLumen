import { Asset, Keypair, TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { invalidateBalanceCache } from '../cache/balances';

export interface TrustlineParams {
  accountSecret: string;
  assetCode: string;
  assetIssuer: string;
  limit?: string;
  memo?: MemoInput;
}

/**
 * Establishes a trustline so an account can hold a community token.
 * Must be called before the account can receive or hold the asset.
 */
export async function establishTrustline(params: TrustlineParams): Promise<string> {
  const { accountSecret, assetCode, assetIssuer, limit, memo } = params;

  const accountKeypair = Keypair.fromSecret(accountSecret);
  const network = StellarService.getNetwork();

  const account = await StellarService.loadAccount(accountKeypair.publicKey());
  const asset = new Asset(assetCode, assetIssuer);

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

  const tx = txBuilder.setTimeout(30).build();

  tx.sign(accountKeypair);

  const result = await StellarService.submitTransaction(tx);
  await invalidateBalanceCache([accountKeypair.publicKey()]);
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
