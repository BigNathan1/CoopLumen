import {
  Asset,
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
import { StellarError, invalidInput, withMappedHorizonError } from './errors';
import { assertAssetCode, assertPositiveAmount, assertPublicKey } from './validation';
import { logger } from '../utils/logger';

export interface PaymentParams {
  senderSecret: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

export interface BuildUnsignedPaymentParams {
  senderPublicKey: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
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
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  } = params;

  assertPublicKey(operation, 'sourcePublicKey', sourcePublicKey);
  assertPublicKey(operation, 'destinationPublicKey', destinationPublicKey);
  assertAssetCode(operation, 'assetCode', assetCode);
  assertPositiveAmount(operation, 'amount', amount);
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
