/**
 * Stellar transaction building helpers.
 *
 * Provides `buildUnsignedPayment`, which constructs a payment transaction
 * using the source account's current sequence number fetched from Horizon.
 * The resulting XDR is unsigned so it can be forwarded to a wallet (e.g.
 * Freighter) for signing before submission.
 */

import { Asset, Memo, TransactionBuilder, BASE_FEE, Operation } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

export interface UnsignedPaymentParams {
  senderPublicKey: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
}

/**
 * Fetches the current sequence number for `senderPublicKey` from Horizon,
 * then builds and returns a base64-encoded unsigned payment XDR.
 *
 * The transaction has a 3-minute timeout, uses the current base fee, and
 * targets the network the service is configured for.
 */
export async function buildUnsignedPayment(params: UnsignedPaymentParams): Promise<string> {
  const {
    senderPublicKey,
    destinationPublicKey,
    assetCode,
    assetIssuer,
    amount,
    memo,
  } = params;

  const account = await StellarService.loadAccount(senderPublicKey);

  const asset =
    assetCode === 'XLM' || !assetIssuer
      ? Asset.native()
      : new Asset(assetCode, assetIssuer);

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetwork(),
  })
    .addOperation(
      Operation.payment({
        destination: destinationPublicKey,
        asset,
        amount,
      })
    )
    .setTimeout(180);

  if (memo) {
    builder.addMemo(Memo.text(memo));
  }

  return builder.build().toXDR();
}
