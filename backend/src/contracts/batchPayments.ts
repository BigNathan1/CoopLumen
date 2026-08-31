import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { invalidateBalanceCache } from '../cache/balances';
import { StellarError, invalidInput, withStellarErrors } from './errors';
import { assertPositiveAmount, assertPublicKey, parseSecretKey } from './validation';

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

/** A text memo is capped at 28 bytes by the protocol. */
const MEMO_MAX_BYTES = 28;

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

/**
 * Resolves the asset for one batch entry. `XLM` means the native asset and
 * needs no issuer; anything else requires one, so a missing issuer is
 * reported here rather than coming back from Horizon as a bare `op_no_issuer`.
 */
function resolveAsset(assetCode: string, assetIssuer: string, operation: string): Asset {
  if (assetCode === 'XLM') {
    return Asset.native();
  }
  if (!assetIssuer) {
    throw invalidInput(operation, `an asset issuer is required for ${assetCode}`);
  }
  assertPublicKey(operation, 'assetIssuer', assetIssuer);
  return new Asset(assetCode, assetIssuer);
}

function assertValidBatch(
  payments: BatchPaymentEntry[],
  memo: string | undefined,
  operation: string
): void {
  if (payments.length === 0) {
    throw invalidInput(operation, 'at least one payment is required');
  }

  if (payments.length > MAX_BATCH_PAYMENTS) {
    throw invalidInput(
      operation,
      `a transaction carries at most ${MAX_BATCH_PAYMENTS} payments, but ${payments.length} were given`
    );
  }

  if (memo !== undefined && Buffer.byteLength(memo, 'utf8') > MEMO_MAX_BYTES) {
    throw invalidInput(operation, `memo must be ${MEMO_MAX_BYTES} bytes or fewer`);
  }

  payments.forEach((payment, index) => {
    // Name the offending entry: in a batch of fifty, "the amount is invalid" is
    // not enough to act on.
    const entryOperation = `${operation} entry ${index + 1}`;
    assertPublicKey(entryOperation, 'destinationPublicKey', payment.destinationPublicKey);
    assertPositiveAmount(entryOperation, 'amount', payment.amount);
    resolveAsset(payment.assetCode, payment.assetIssuer, entryOperation);
  });
}

function buildBatchTransaction(
  account: Horizon.AccountResponse,
  payments: BatchPaymentEntry[],
  memo: string | undefined,
  operation: string
): Transaction {
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetwork(),
  });

  payments.forEach((payment, index) => {
    builder.addOperation(
      Operation.payment({
        destination: payment.destinationPublicKey,
        asset: resolveAsset(
          payment.assetCode,
          payment.assetIssuer,
          `${operation} entry ${index + 1}`
        ),
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
  const operation = 'Batch payment build';
  const { senderPublicKey, payments, memo } = params;

  assertValidBatch(payments, memo, operation);

  return withStellarErrors(operation, async () => {
    const account = await StellarService.loadAccount(senderPublicKey);
    return buildBatchTransaction(account, payments, memo, operation).toXDR();
  });
}

/**
 * Builds, signs and submits a batch payment from a server-held keypair, such as
 * a community distributor paying out to its members.
 *
 * @returns The hash of the transaction Horizon accepted.
 */
export async function submitBatchPayment(params: SubmitBatchPaymentParams): Promise<string> {
  const operation = 'Batch payment';
  const { senderSecret, payments, memo } = params;

  assertValidBatch(payments, memo, operation);

  const senderKeypair = parseSecretKey(operation, 'senderSecret', senderSecret);
  const senderPublicKey = senderKeypair.publicKey();

  let hash: string;
  try {
    hash = await withStellarErrors(operation, async () => {
      const account = await StellarService.loadAccount(senderPublicKey);
      const transaction = buildBatchTransaction(account, payments, memo, operation);
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
