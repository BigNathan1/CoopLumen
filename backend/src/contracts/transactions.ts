import {
  Asset,
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Memo,
  Transaction,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

export interface PaymentParams {
  senderSecret: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
}

export interface BuildUnsignedPaymentParams {
  senderPublicKey: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
}

/**
 * Submits a signed payment from a server-held keypair (e.g., community distributor).
 */
export async function submitPayment(params: PaymentParams): Promise<string> {
  const {
    senderSecret,
    destinationPublicKey,
    assetCode,
    assetIssuer,
    amount,
    memo,
  } = params;

  const senderKeypair = Keypair.fromSecret(senderSecret);
  const server = StellarService.getServer();
  const network = StellarService.getNetwork();

  const account = await server.loadAccount(senderKeypair.publicKey());
  const asset =
    assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  }).addOperation(
    Operation.payment({ destination: destinationPublicKey, asset, amount })
  );

  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  }

  const tx = txBuilder.setTimeout(30).build();
  tx.sign(senderKeypair);

  const result = await server.submitTransaction(tx);
  return result.hash;
}

/**
 * Builds an unsigned XDR transaction for client-side signing via Freighter.
 */
export async function buildUnsignedPayment(
  params: BuildUnsignedPaymentParams
): Promise<string> {
  const {
    senderPublicKey,
    destinationPublicKey,
    assetCode,
    assetIssuer,
    amount,
    memo,
  } = params;

  const server = StellarService.getServer();
  const network = StellarService.getNetwork();

  const account = await server.loadAccount(senderPublicKey);
  const asset =
    assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  }).addOperation(
    Operation.payment({ destination: destinationPublicKey, asset, amount })
  );

  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  }

  return txBuilder.setTimeout(30).build().toXDR();
}

export async function submitSignedXdr(xdr: string): Promise<string> {
  const server = StellarService.getServer();
  const network = StellarService.getNetwork();
  const tx = new Transaction(xdr, network);
  const result = await server.submitTransaction(tx);
  return result.hash;
}
