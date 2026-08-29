import { Asset, Keypair, TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { invalidateBalanceCache } from '../cache/balances';
import { withSequenceRetry } from './sequenceCache';

export interface TrustlineParams {
  accountSecret: string;
  assetCode: string;
  assetIssuer: string;
  limit?: string;
  memo?: MemoInput;
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
  const { accountSecret, assetCode, assetIssuer, limit, memo } = params;

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

    const tx = txBuilder.setTimeout(30).build();
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
