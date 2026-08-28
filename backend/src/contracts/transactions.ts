import { Asset, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

const BASE_FEE = '100';
const TX_TIMEOUT_SECONDS = 30;

export interface UnsignedPaymentParams {
  senderPublicKey: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
}

/**
 * Loads the sender account from Horizon to get the current sequence number,
 * then builds and returns an unsigned Stellar payment transaction XDR.
 * Does not sign or submit the transaction.
 */
export async function buildUnsignedPayment(params: UnsignedPaymentParams): Promise<string> {
  const { senderPublicKey, destinationPublicKey, assetCode, assetIssuer, amount, memo } = params;

  const sourceAccount = await StellarService.loadAccount(senderPublicKey);

  const asset =
    assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);

  const network = StellarService.getNetwork();
  const networkPassphrase =
    network === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET;

  const builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: destinationPublicKey,
        asset,
        amount,
      })
    )
    .setTimeout(TX_TIMEOUT_SECONDS);

  if (memo) {
    builder.addMemo(Memo.text(memo));
  }

  const transaction = builder.build();
  return transaction.toXDR();
}
