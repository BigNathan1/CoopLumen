import {
  BASE_FEE,
  FeeBumpTransaction,
  Keypair,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

export interface FeeBumpParams {
  /** The already-signed inner transaction (base64 XDR) submitted by the user. */
  innerTransactionXdr: string;
  /** Secret key of the account that will pay the network fee for the inner transaction. */
  sponsorSecret: string;
  /** Fee (in stroops) the sponsor pays, per operation in the fee-bump transaction. Defaults to the network base fee. */
  baseFee?: string;
}

/**
 * Wraps a user's signed transaction in a fee-bump transaction so a sponsor
 * account covers the network fee instead of the transaction's own source account.
 */
export function buildFeeBumpTransaction(params: FeeBumpParams): FeeBumpTransaction {
  const { innerTransactionXdr, sponsorSecret, baseFee } = params;

  const network = StellarService.getNetworkPassphrase();
  const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
  const innerTransaction = new Transaction(innerTransactionXdr, network);

  const feeBumpTransaction = TransactionBuilder.buildFeeBumpTransaction(
    sponsorKeypair,
    baseFee ?? BASE_FEE,
    innerTransaction,
    network
  );

  feeBumpTransaction.sign(sponsorKeypair);
  return feeBumpTransaction;
}

/** Builds, signs, and submits a fee-bump transaction wrapping a user's signed transaction. */
export async function submitFeeBumpTransaction(params: FeeBumpParams): Promise<string> {
  const feeBumpTransaction = buildFeeBumpTransaction(params);
  const result = await StellarService.submitTransaction(feeBumpTransaction);
  return result.hash;
}
