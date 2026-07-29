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
 * Issues a new community token on the Stellar network.
 * The issuer account creates the asset and sends initial supply to a distributor.
 */
export async function issueAsset(params: IssueAssetParams): Promise<string> {
  const { issuerSecret, assetCode, distributorPublicKey, amount, memo } = params;

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

/**
 * Burns tokens by sending them back to the issuing account. Stellar assets
 * held by their own issuer are not part of circulating supply, so a payment
 * to the issuer permanently reduces total supply (the issuer never resends it).
 */
export async function burnAsset(params: BurnAssetParams): Promise<string> {
  const { holderSecret, assetCode, assetIssuer, amount } = params;

  const holderKeypair = Keypair.fromSecret(holderSecret);
  const server = StellarService.getServer();
  const network = StellarService.getNetwork();

  const holderAccount = await server.loadAccount(holderKeypair.publicKey());
  const asset = new Asset(assetCode, assetIssuer);

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

  const result = await server.submitTransaction(tx);
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
  let page = await server.accounts().forAsset(asset).limit(200).call();

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
    page = await page.next();
  }

  return holders;
}

export function buildAsset(code: string, issuer: string): AssetDetails {
  const asset = new Asset(code, issuer);
  return { code, issuer, asset };
}

export function getNetworkPassphrase(network: 'testnet' | 'mainnet'): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}
