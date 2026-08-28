import {
  Asset,
  BASE_FEE,
  FeeBumpTransaction,
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

/** Seconds a built transaction stays valid before Horizon rejects it as too late. */
const TRANSACTION_TIMEOUT_SECONDS = 30;

/** Stellar amounts carry at most seven decimal places. */
const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/;

/** A text memo is capped at 28 bytes by the protocol. */
const MEMO_MAX_BYTES = 28;

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

interface PaymentDetails {
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
}

/** Reports a caller mistake as a 400-class `StellarError` instead of an opaque SDK throw. */
function reject(action: string, detail: string): never {
  throw new StellarError(`${action} failed: ${detail}`, { status: 400 });
}

/**
 * Resolves the asset to pay in. `XLM` means the native asset and needs no
 * issuer; anything else requires one, so a missing issuer is reported here
 * rather than coming back from Horizon as a bare `op_no_issuer`.
 */
function resolveAsset(assetCode: string, assetIssuer: string, action: string): Asset {
  if (assetCode === 'XLM') {
    return Asset.native();
  }
  if (!assetIssuer) {
    return reject(action, `an asset issuer is required for ${assetCode}`);
  }
  try {
    return new Asset(assetCode, assetIssuer);
  } catch {
    return reject(action, `${assetCode} is not a valid asset for issuer ${assetIssuer}`);
  }
}

/** Validates the parts of a payment Horizon would otherwise reject with a vague code. */
function assertValidPayment(details: PaymentDetails, action: string): void {
  try {
    Keypair.fromPublicKey(details.destinationPublicKey);
  } catch {
    reject(action, 'the destination is not a valid Stellar public key');
  }

  if (!AMOUNT_PATTERN.test(details.amount) || Number(details.amount) <= 0) {
    reject(action, 'the amount must be a positive number with at most 7 decimal places');
  }

  if (details.memo !== undefined && Buffer.byteLength(details.memo, 'utf8') > MEMO_MAX_BYTES) {
    reject(action, `the memo must be ${MEMO_MAX_BYTES} bytes or fewer`);
  }
}

function buildPaymentTransaction(
  account: Horizon.AccountResponse,
  details: PaymentDetails,
  action: string
): Transaction {
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetwork(),
  }).addOperation(
    Operation.payment({
      destination: details.destinationPublicKey,
      asset: resolveAsset(details.assetCode, details.assetIssuer, action),
      amount: details.amount,
    })
  );

  if (details.memo) {
    builder.addMemo(Memo.text(details.memo));
  }

  return builder.setTimeout(TRANSACTION_TIMEOUT_SECONDS).build();
}

/** Parses a signed envelope, reporting a malformed one as a 400 rather than a 500. */
function parseEnvelope(xdr: string, action: string): Transaction | FeeBumpTransaction {
  try {
    return TransactionBuilder.fromXDR(xdr, StellarService.getNetwork());
  } catch {
    return reject(action, 'the XDR is not a valid transaction envelope for the configured network');
  }
}

/**
 * Submits a payment signed by a server-held keypair, such as a community
 * distributor account.
 *
 * Every Horizon failure is translated into a `StellarError` whose message names
 * the actual cause (`op_underfunded`, `op_no_trust`, `tx_bad_seq`, ...) and
 * whose `status` the API error handler returns as-is. The original Horizon
 * response travels along on the error, so nothing is lost for logging or for
 * the response mapping in `api/utils/horizonError.ts`.
 *
 * @returns The hash of the transaction Horizon accepted.
 */
export async function submitPayment(params: PaymentParams): Promise<string> {
  const action = 'Payment';
  const { senderSecret, ...details } = params;

  assertValidPayment(details, action);

  let senderKeypair: Keypair;
  try {
    senderKeypair = Keypair.fromSecret(senderSecret);
  } catch {
    reject(action, 'the sender secret is not a valid Stellar secret key');
  }

  const senderPublicKey = senderKeypair.publicKey();

  const hash = await withStellarErrors(action, async () => {
    const account = await StellarService.loadAccount(senderPublicKey);
    const transaction = buildPaymentTransaction(account, details, action);
    transaction.sign(senderKeypair);

    const result = await StellarService.submitTransaction(transaction);
    return result.hash;
  });

  await invalidateBalanceCache([senderPublicKey, details.destinationPublicKey]);
  return hash;
}

/**
 * Builds an unsigned payment as base64 XDR for client-side signing, e.g. by a
 * Freighter wallet. The sequence number comes from Horizon, so the caller has
 * until the 30 second timeout expires to submit the signed envelope.
 */
export async function buildUnsignedPayment(params: BuildUnsignedPaymentParams): Promise<string> {
  const action = 'Payment build';
  const { senderPublicKey, ...details } = params;

  assertValidPayment(details, action);

  return withStellarErrors(action, async () => {
    const account = await StellarService.loadAccount(senderPublicKey);
    return buildPaymentTransaction(account, details, action).toXDR();
  });
}

/**
 * Submits an already signed transaction envelope, such as the one a wallet
 * returns after signing the XDR from `buildUnsignedPayment`.
 */
export async function submitSignedXdr(xdr: string): Promise<string> {
  const action = 'Transaction submission';
  const transaction = parseEnvelope(xdr, action);

  return withStellarErrors(action, async () => {
    const result = await StellarService.submitTransaction(transaction);
    return result.hash;
  });
}
