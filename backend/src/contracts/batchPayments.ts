import {
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { invalidateBalanceCache } from '../cache/balances';
import { StellarError, withStellarErrors } from './errors';
import { assertValidPayment, rejectPayment, resolveAsset } from './transactions';

/**
 * Batch disbursal: one transaction carrying many Payment operations.
 *
 * A community payout to fifty members as fifty separate transactions costs
 * fifty fees, fifty sequence numbers and fifty chances to half-finish. As a
 * single transaction it is atomic — every payment lands or none does — and
 * costs one base fee per operation on one sequence number.
 */

/** Stellar allows at most 100 operations in one transaction. */
export const MAX_BATCH_PAYMENTS = 100;

/** Seconds a built transaction stays valid before Horizon rejects it as too late. */
const TRANSACTION_TIMEOUT_SECONDS = 30;

export interface BatchPaymentEntry {
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
}

export interface BuildBatchPaymentParams {
  senderPublicKey: string;
  payments: BatchPaymentEntry[];
  /** Single text memo for the whole transaction, at most 28 bytes. */
  memo?: string;
}

export interface SubmitBatchPaymentParams {
  senderSecret: string;
  payments: BatchPaymentEntry[];
  memo?: string;
}

function assertValidBatch(
  payments: BatchPaymentEntry[],
  memo: string | undefined,
  action: string
): void {
  if (payments.length === 0) {
    rejectPayment(action, 'at least one payment is required');
  }

  if (payments.length > MAX_BATCH_PAYMENTS) {
    rejectPayment(
      action,
      `a transaction carries at most ${MAX_BATCH_PAYMENTS} payments, but ${payments.length} were given`
    );
  }

  payments.forEach((payment, index) => {
    // Name the offending entry: in a batch of fifty, "the amount is invalid" is
    // not enough to act on.
    assertValidPayment({ ...payment, memo }, `${action} entry ${index + 1}`);
  });
}

function buildBatchTransaction(
  account: Horizon.AccountResponse,
  payments: BatchPaymentEntry[],
  memo: string | undefined,
  action: string
): Transaction {
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetwork(),
  });

  payments.forEach((payment, index) => {
    builder.addOperation(
      Operation.payment({
        destination: payment.destinationPublicKey,
        asset: resolveAsset(payment.assetCode, payment.assetIssuer, `${action} entry ${index + 1}`),
        amount: payment.amount,
      })
    );
  });

  if (memo) {
    builder.addMemo(Memo.text(memo));
  }

  return builder.setTimeout(TRANSACTION_TIMEOUT_SECONDS).build();
}

/**
 * Points a failed batch at the entry that failed.
 *
 * Horizon returns one result code per operation, in order, so the index of the
 * first failing code identifies the payment that broke the batch. Without this
 * the caller only learns that "a" destination has no trustline.
 */
function attributeFailure(error: StellarError, payments: BatchPaymentEntry[]): StellarError {
  const operations = error.resultCodes?.operations;
  if (!operations) {
    return error;
  }

  const index = operations.findIndex((code) => code !== 'op_success' && code !== '');
  const entry = index >= 0 ? payments[index] : undefined;
  if (!entry) {
    return error;
  }

  return new StellarError(
    `${error.message} — payment ${index + 1} of ${payments.length}, to ${entry.destinationPublicKey}`,
    {
      status: error.status,
      ...(error.resultCodes && { resultCodes: error.resultCodes }),
      ...(error.response && { response: error.response }),
      cause: error,
    }
  );
}

/**
 * Builds one unsigned transaction carrying a Payment operation per entry, as
 * base64 XDR for client-side signing.
 *
 * The whole batch is atomic: if any single payment is rejected, the transaction
 * fails and no payment is applied. Entries may mix assets and repeat a
 * destination; each becomes its own operation, in the order given.
 */
export async function buildBatchPayment(params: BuildBatchPaymentParams): Promise<string> {
  const action = 'Batch payment build';
  const { senderPublicKey, payments, memo } = params;

  assertValidBatch(payments, memo, action);

  return withStellarErrors(action, async () => {
    const account = await StellarService.loadAccount(senderPublicKey);
    return buildBatchTransaction(account, payments, memo, action).toXDR();
  });
}

/**
 * Builds, signs and submits a batch payment from a server-held keypair, such as
 * a community distributor paying out to its members.
 *
 * @returns The hash of the transaction Horizon accepted.
 */
export async function submitBatchPayment(params: SubmitBatchPaymentParams): Promise<string> {
  const action = 'Batch payment';
  const { senderSecret, payments, memo } = params;

  assertValidBatch(payments, memo, action);

  let senderKeypair: Keypair;
  try {
    senderKeypair = Keypair.fromSecret(senderSecret);
  } catch {
    rejectPayment(action, 'the sender secret is not a valid Stellar secret key');
  }

  const senderPublicKey = senderKeypair.publicKey();

  let hash: string;
  try {
    hash = await withStellarErrors(action, async () => {
      const account = await StellarService.loadAccount(senderPublicKey);
      const transaction = buildBatchTransaction(account, payments, memo, action);
      transaction.sign(senderKeypair);

      const result = await StellarService.submitTransaction(transaction);
      return result.hash;
    });
  } catch (error) {
    throw error instanceof StellarError ? attributeFailure(error, payments) : error;
  }

  await invalidateBalanceCache([
    senderPublicKey,
    ...payments.map((payment) => payment.destinationPublicKey),
  ]);
  return hash;
}
