import { Asset, Keypair, Memo, Operation, BASE_FEE, TransactionBuilder } from '@stellar/stellar-sdk';
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
 * Builds an unsigned payment transaction XDR for the sender to sign.
 * Loads the current sequence number from Horizon and increments it by 1.
 * This XDR can then be signed and submitted by the client wallet.
 *
 * @param params Payment parameters
 * @returns Base64-encoded XDR transaction ready for signing
 */
export async function buildUnsignedPayment(params: UnsignedPaymentParams): Promise<string> {
  const { senderPublicKey, destinationPublicKey, assetCode, assetIssuer, amount, memo } = params;

  const network = StellarService.getNetwork();
  const senderAccount = await StellarService.loadAccount(senderPublicKey);

  // Determine the asset: native XLM or custom asset
  const asset = assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);

  const txBuilder = new TransactionBuilder(senderAccount, {
    fee: BASE_FEE,
    networkPassphrase: network,
  });

  // Add memo if provided
  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  }

  // Add payment operation
  txBuilder.addOperation(
    Operation.payment({
      destination: destinationPublicKey,
      asset,
      amount,
    })
  );

  // Set 30-second timeout
  const tx = txBuilder.setTimeout(30).build();

  // Return as base64-encoded XDR
  return tx.toXDR();
}
