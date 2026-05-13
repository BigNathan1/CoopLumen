import {
  Asset,
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

export interface TrustlineParams {
  accountSecret: string;
  assetCode: string;
  assetIssuer: string;
  limit?: string;
}

/**
 * Establishes a trustline so an account can hold a community token.
 * Must be called before the account can receive or hold the asset.
 */
export async function establishTrustline(
  params: TrustlineParams
): Promise<string> {
  const { accountSecret, assetCode, assetIssuer, limit } = params;

  const accountKeypair = Keypair.fromSecret(accountSecret);
  const server = StellarService.getServer();
  const network = StellarService.getNetwork();

  const account = await server.loadAccount(accountKeypair.publicKey());
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

  tx.sign(accountKeypair);

  const result = await server.submitTransaction(tx);
  return result.hash;
}

/**
 * Removes a trustline from an account. The account balance for that
 * asset must be zero before removal succeeds on the network.
 */
export async function removeTrustline(
  params: Omit<TrustlineParams, 'limit'>
): Promise<string> {
  return establishTrustline({ ...params, limit: '0' });
}

export async function hasTrustline(
  publicKey: string,
  assetCode: string,
  assetIssuer: string
): Promise<boolean> {
  const server = StellarService.getServer();
  const account = await server.loadAccount(publicKey);
  return account.balances.some(
    (b) =>
      b.asset_type !== 'native' &&
      'asset_code' in b &&
      b.asset_code === assetCode &&
      b.asset_issuer === assetIssuer
  );
}
