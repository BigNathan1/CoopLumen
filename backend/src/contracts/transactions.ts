import { Asset, TransactionBuilder, Operation, BASE_FEE, Memo } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

export interface BuildUnsignedPaymentParams {
  senderPublicKey: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
}

/**
 * Builds an unsigned payment transaction XDR for a wallet to sign
 * client-side. Loads the sender's current sequence number from Horizon;
 * does not submit anything.
 */
export async function buildUnsignedPayment(params: BuildUnsignedPaymentParams): Promise<string> {
  const { senderPublicKey, destinationPublicKey, assetCode, assetIssuer, amount, memo } = params;

  const account = await StellarService.loadAccount(senderPublicKey);
  const asset = assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);
  const network = StellarService.getNetwork();

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  }).addOperation(
    Operation.payment({
      destination: destinationPublicKey,
      asset,
      amount,
    })
  );

  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  }

  const tx = txBuilder.setTimeout(30).build();
  return tx.toXDR();
}
