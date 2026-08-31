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
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Transaction,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds, DEFAULT_TIMEOUT_SECONDS } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { StellarOperationError, invalidInput, withMappedHorizonError } from './errors';
import {
  TRANSACTION_TIMEOUT_SECONDS,
  assertAssetCode,
  assertMemoLength,
  assertPositiveAmount,
  assertPublicKey,
} from './validation';
import { StellarError, invalidInput, withMappedHorizonError } from './errors';
import { assertAssetCode, assertPositiveAmount, assertPublicKey } from './validation';
import { logger } from '../utils/logger';

export interface PaymentParams {
  senderSecret: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

export interface BuildUnsignedPaymentParams {
  senderPublicKey: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
}

/** The parts of a payment shared by the single and batch builders. */
export interface PaymentDetails {
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
}

/**
 * Reports a caller mistake as a 400-class `StellarError` instead of an opaque
 * SDK throw. Exported alongside the validation helpers below so every payment
 * builder in the contracts layer rejects bad input the same way.
 */
export function rejectPayment(action: string, detail: string): never {
  throw new StellarError(`${action} failed: ${detail}`, { status: 400 });
}

/**
 * Resolves the asset to pay in. `XLM` means the native asset and needs no
 * issuer; anything else requires one, so a missing issuer is reported here
 * rather than coming back from Horizon as a bare `op_no_issuer`.
 */
export function resolveAsset(assetCode: string, assetIssuer: string, action: string): Asset {
  if (assetCode === 'XLM') {
    return Asset.native();
  }
  if (!assetIssuer) {
    return rejectPayment(action, `an asset issuer is required for ${assetCode}`);
  }
  try {
    return new Asset(assetCode, assetIssuer);
  } catch {
    return rejectPayment(action, `${assetCode} is not a valid asset for issuer ${assetIssuer}`);
  }
}

/** Validates the parts of a payment Horizon would otherwise reject with a vague code. */
export function assertValidPayment(details: PaymentDetails, action: string): void {
  try {
    Keypair.fromPublicKey(details.destinationPublicKey);
  } catch {
    rejectPayment(action, 'the destination is not a valid Stellar public key');
  }

  if (!AMOUNT_PATTERN.test(details.amount) || Number(details.amount) <= 0) {
    rejectPayment(action, 'the amount must be a positive number with at most 7 decimal places');
  }

  if (details.memo !== undefined && Buffer.byteLength(details.memo, 'utf8') > MEMO_MAX_BYTES) {
    rejectPayment(action, `the memo must be ${MEMO_MAX_BYTES} bytes or fewer`);
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
    return rejectPayment(
      action,
      'the XDR is not a valid transaction envelope for the configured network'
    );
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
    rejectPayment(action, 'the sender secret is not a valid Stellar secret key');
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
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

/**
 * Submits a signed payment from a server-held keypair (e.g., community distributor).
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

export async function submitSignedXdr(xdr: string): Promise<string> {
  const network = StellarService.getNetwork();
  const tx = new Transaction(xdr, network);
  const result = await StellarService.submitTransaction(tx);
  return result.hash;
}

export interface MultiSigPaymentParams {
  /** The multi-signature account the payment is sent from. */
  sourcePublicKey: string;
  destinationPublicKey: string;
  /** `XLM` for the native asset; any other code requires `assetIssuer`. */
  assetCode: string;
  assetIssuer?: string;
  amount: string;
  memo?: string;
  memo?: MemoInput;
  /** How long the collected signatures have to arrive. Defaults to 30 seconds. */
  timeoutSeconds?: number;
}

/** A signer that can contribute weight toward authorizing the transaction. */
export interface MultiSigSigner {
  key: string;
  weight: number;
  type: string;
}

export interface MultiSigPayment {
  /** Unsigned transaction envelope for the co-signers to sign in turn. */
  xdr: string;
  /** The passphrase each signer must sign against. */
  networkPassphrase: string;
  /** Combined signature weight the envelope must reach to be accepted. */
  requiredWeight: number;
  /** Signers eligible to contribute weight, heaviest first. This is the M. */
  signers: MultiSigSigner[];
  /** Total weight available if every eligible signer signs. */
  availableWeight: number;
  /** Fewest signatures that can reach `requiredWeight`. This is the N. */
  minimumSignatures: number;
}

/**
 * Builds an unsigned payment from an account governed by N-of-M signing.
 *
 * A payment is a medium-threshold operation, so the envelope is authorized
 * once the combined weight of its signatures reaches the source account's
 * `med_threshold`. The unsigned XDR is returned together with everything a
 * caller needs to collect those signatures: the eligible signers with their
 * weights, the weight to reach, and the fewest signatures that can reach it.
 *
 * The transaction is deliberately left unsigned. Signers apply their own keys
 * to the returned XDR — no secret is passed to or held by this function.
 *
 * When the account's signers cannot reach the threshold even collectively,
 * the payment can never be authorized, so this fails immediately rather than
 * returning an envelope that is impossible to satisfy.
 *
 * @throws {StellarOperationError} on invalid input, an unreachable threshold,
 * or any Horizon failure.
 * @throws {StellarError} on invalid input, an unreachable threshold, or any
 * Horizon failure.
 */
export async function buildMultiSigPayment(
  params: MultiSigPaymentParams
): Promise<MultiSigPayment> {
  const operation = 'buildMultiSigPayment';
  const {
    sourcePublicKey,
    destinationPublicKey,
    assetCode,
    assetIssuer,
    amount,
    memo,
    timeoutSeconds = TRANSACTION_TIMEOUT_SECONDS,
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  } = params;

  assertPublicKey(operation, 'sourcePublicKey', sourcePublicKey);
  assertPublicKey(operation, 'destinationPublicKey', destinationPublicKey);
  assertAssetCode(operation, 'assetCode', assetCode);
  assertPositiveAmount(operation, 'amount', amount);
  assertMemoLength(operation, memo);
  const builtMemo = buildMemo(memo);

  const isNative = assetCode === 'XLM';
  if (!isNative) {
    if (assetIssuer === undefined) {
      throw invalidInput(operation, 'assetIssuer is required for any asset other than XLM.');
    }
    assertPublicKey(operation, 'assetIssuer', assetIssuer);
  }

  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
    throw invalidInput(operation, 'timeoutSeconds must be a positive whole number of seconds.');
  }

  const logContext = {
    operation,
    sourcePublicKey,
    destinationPublicKey,
    assetCode,
    amount,
  };

  const account = await withMappedHorizonError(operation, logContext, () =>
    StellarService.loadAccount(sourcePublicKey)
  );

  // A payment is a medium-threshold operation, so med_threshold is the weight
  // the collected signatures must reach.
  const requiredWeight = account.thresholds.med_threshold;

  // Weight-zero signers exist on-chain but can never contribute; listing them
  // would overstate M and mislead whoever is collecting signatures.
  const signers: MultiSigSigner[] = account.signers
    .filter((signer) => signer.weight > 0)
    .map((signer) => ({ key: signer.key, weight: signer.weight, type: signer.type }))
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

  const availableWeight = signers.reduce((total, signer) => total + signer.weight, 0);

  if (availableWeight < requiredWeight) {
    throw new StellarOperationError({
      operation,
      code: 'MISSING_SIGNATURES',
      message: `Account ${sourcePublicKey} has a combined signer weight of ${availableWeight}, below its medium threshold of ${requiredWeight}; no payment from it can be authorized until a signer is added or the threshold is lowered.`,
      httpStatus: 409,
    });
    throw new StellarError(
      `${operation} failed: account ${sourcePublicKey} has a combined signer weight of ${availableWeight}, below its medium threshold of ${requiredWeight}; no payment from it can be authorized until a signer is added or the threshold is lowered.`,
      { status: 409 }
    );
  }

  // Signing the heaviest signers first gives the fewest signatures that can
  // reach the threshold, which is the N a caller has to collect.
  let accumulated = 0;
  let minimumSignatures = 0;
  for (const signer of signers) {
    if (accumulated >= requiredWeight) break;
    accumulated += signer.weight;
    minimumSignatures += 1;
  }

  const asset = isNative ? Asset.native() : new Asset(assetCode, assetIssuer as string);
  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetwork(),
  }).addOperation(Operation.payment({ destination: destinationPublicKey, asset, amount }));

  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  if (builtMemo) {
    txBuilder.addMemo(builtMemo);
  }

  const xdr = txBuilder.setTimeout(timeoutSeconds).build().toXDR();

  logger.info('Built multi-signature payment', {
    ...logContext,
    requiredWeight,
    availableWeight,
    minimumSignatures,
    totalSigners: signers.length,
  });

  return {
    xdr,
    networkPassphrase: StellarService.getNetwork(),
    requiredWeight,
    signers,
    availableWeight,
    minimumSignatures,
  };
}
