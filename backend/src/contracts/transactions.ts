import {
  Asset,
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Transaction,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';

export interface PaymentParams {
  senderSecret: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

export interface BuildUnsignedPaymentParams {
  senderPublicKey: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

/**
 * Submits a signed payment from a server-held keypair (e.g., community distributor).
 */
/**
 * Handles Stellar Horizon contract interaction for submitPayment.
 * @param params Parameter description for params.
 * @returns {Promise<any>} Resolves with network response or operation result.
 * @throws {Error} Maps Horizon/Stellar SDK error codes to actionable messages.
 */
export async function submitPayment(params: PaymentParams): Promise<string> {
  const { senderSecret, destinationPublicKey, assetCode, assetIssuer, amount, memo, timeBounds } =
    params;

  const senderKeypair = Keypair.fromSecret(senderSecret);
  const network = StellarService.getNetwork();

  const account = await StellarService.loadAccount(senderKeypair.publicKey());
  const asset = assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  }).addOperation(Operation.payment({ destination: destinationPublicKey, asset, amount }));

  const builtMemo = buildMemo(memo);
  if (builtMemo) {
    txBuilder.addMemo(builtMemo);
  }

  const tx = applyTimeBounds(txBuilder, timeBounds).build();
  tx.sign(senderKeypair);

  const result = await StellarService.submitTransaction(tx);
  await invalidateBalanceCache([senderKeypair.publicKey(), destinationPublicKey]);
  return result.hash;
}

/**
 * Builds an unsigned XDR transaction for client-side signing via Freighter.
 */
/**
 * Handles Stellar Horizon contract interaction for buildUnsignedPayment.
 * @param params Parameter description for params.
 * @returns {Promise<any>} Resolves with network response or operation result.
 * @throws {Error} Maps Horizon/Stellar SDK error codes to actionable messages.
 */
export async function buildUnsignedPayment(params: BuildUnsignedPaymentParams): Promise<string> {
  const {
    senderPublicKey,
    destinationPublicKey,
    assetCode,
    assetIssuer,
    amount,
    memo,
    timeBounds,
  } = params;

  const network = StellarService.getNetwork();

  const account = await StellarService.loadAccount(senderPublicKey);
  const asset = assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  }).addOperation(Operation.payment({ destination: destinationPublicKey, asset, amount }));

  const builtMemo = buildMemo(memo);
  if (builtMemo) {
    txBuilder.addMemo(builtMemo);
  }

  return applyTimeBounds(txBuilder, timeBounds).build().toXDR();
}

/**
 * Handles Stellar Horizon contract interaction for submitSignedXdr.
 * @param xdr Parameter description for xdr.
 * @returns {Promise<any>} Resolves with network response or operation result.
 * @throws {Error} Maps Horizon/Stellar SDK error codes to actionable messages.
 */
export async function submitSignedXdr(xdr: string): Promise<string> {
  const network = StellarService.getNetwork();
  const tx = new Transaction(xdr, network);
  const result = await StellarService.submitTransaction(tx);
  return result.hash;
}
