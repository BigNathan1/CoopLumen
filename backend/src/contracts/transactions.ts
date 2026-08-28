import { Asset, BASE_FEE, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
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
 * Builds an unsigned payment transaction XDR for the given parameters.
 * The caller is responsible for signing and submitting the transaction.
 *
 * Uses the current Horizon sequence number for the sender account so the
 * transaction is immediately valid for submission once signed.
 */
export async function buildUnsignedPayment(params: UnsignedPaymentParams): Promise<string> {
  const { senderPublicKey, destinationPublicKey, assetCode, assetIssuer, amount, memo } = params;

  const account = await StellarService.loadAccount(senderPublicKey);
  const network = StellarService.getNetwork();

  const asset = assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  });

  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  }

  txBuilder.addOperation(
    Operation.payment({
      destination: destinationPublicKey,
      asset,
      amount,
    })
  );

  return txBuilder.setTimeout(30).build().toXDR();
}
