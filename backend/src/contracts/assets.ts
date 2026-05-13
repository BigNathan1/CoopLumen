import {
  Asset,
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Memo,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

export interface IssueAssetParams {
  issuerSecret: string;
  assetCode: string;
  distributorPublicKey: string;
  amount: string;
  memo?: string;
}

export interface AssetDetails {
  code: string;
  issuer: string;
  asset: Asset;
}

/**
 * Issues a new community token on the Stellar network.
 * The issuer account creates the asset and sends initial supply to a distributor.
 */
export async function issueAsset(params: IssueAssetParams): Promise<string> {
  const { issuerSecret, assetCode, distributorPublicKey, amount, memo } =
    params;

  const issuerKeypair = Keypair.fromSecret(issuerSecret);
  const server = StellarService.getServer();
  const network = StellarService.getNetwork();

  const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());
  const asset = new Asset(assetCode, issuerKeypair.publicKey());

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

  const result = await server.submitTransaction(tx);
  return result.hash;
}

export function buildAsset(code: string, issuer: string): AssetDetails {
  const asset = new Asset(code, issuer);
  return { code, issuer, asset };
}

export function getNetworkPassphrase(network: 'testnet' | 'mainnet'): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}
