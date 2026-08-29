import { FeeBumpTransaction, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

/** Base64 alphabet with optional `=` padding; anything else cannot be an XDR envelope. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export interface ValidateXdrOptions {
  /**
   * Network passphrase the envelope is expected to belong to.
   * Defaults to the network the configured Horizon instance runs on.
   */
  networkPassphrase?: string;
  /**
   * Reference time used for the time-bounds expiry check, in seconds since the
   * Unix epoch. Defaults to the current time. Exposed for deterministic tests.
   */
  nowSeconds?: number;
}

export interface XdrValidationResult {
  valid: boolean;
  error?: string;
}

function invalid(error: string): XdrValidationResult {
  return { valid: false, error };
}

/**
 * Turns a Stellar SDK decoding failure into an actionable message. The SDK
 * surfaces low-level XDR reader errors ("XDR Read Error: Bad union switch: 42")
 * that mean nothing to an API consumer, so they are mapped to plain language.
 */
function describeDecodeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/bad union switch/i.test(message)) {
    return 'XDR envelope type is not recognised. Expected a transaction or fee-bump transaction envelope.';
  }

  if (/invalid character|base64|non-canonical/i.test(message)) {
    return 'XDR is not valid base64. Expected a base64-encoded transaction envelope.';
  }

  if (/xdr read error|remaining bytes|unexpected end|length/i.test(message)) {
    return 'XDR could not be decoded. The envelope is malformed or truncated.';
  }

  return `XDR could not be decoded: ${message}`;
}

function formatUnixSeconds(seconds: string | number): string {
  const asNumber = Number(seconds);
  if (!Number.isFinite(asNumber)) return String(seconds);
  return new Date(asNumber * 1000).toISOString();
}

/**
 * Validates the structure of an already-built transaction envelope.
 * Fee-bump envelopes delegate to their inner transaction.
 */
function validateEnvelope(
  transaction: Transaction | FeeBumpTransaction,
  nowSeconds: number
): XdrValidationResult {
  if (transaction instanceof FeeBumpTransaction) {
    if (!transaction.feeSource) {
      return invalid('Fee-bump transaction is missing a fee source account.');
    }
    return validateEnvelope(transaction.innerTransaction, nowSeconds);
  }

  if (transaction.operations.length === 0) {
    return invalid('Transaction contains no operations and would be rejected by the network.');
  }

  const maxTime = transaction.timeBounds?.maxTime;
  if (maxTime && Number(maxTime) > 0 && Number(maxTime) < nowSeconds) {
    return invalid(
      `Transaction expired at ${formatUnixSeconds(maxTime)} and can no longer be submitted. Rebuild it with fresh time bounds.`
    );
  }

  return { valid: true };
}

/**
 * Checks whether a base64 transaction envelope can be decoded and submitted.
 *
 * This is a pure, offline check: it never contacts Horizon, so route handlers
 * can reject obviously bad wallet output before spending a network round trip.
 * A `true` result means the envelope decodes, targets the expected network
 * passphrase, carries at least one operation, and has not expired. It does not
 * assert that signatures satisfy the source account's signing thresholds --
 * only the network can decide that.
 */
export function validateXdr(xdr: unknown, options: ValidateXdrOptions = {}): XdrValidationResult {
  if (typeof xdr !== 'string') {
    return invalid('XDR must be a string.');
  }

  const trimmed = xdr.trim();
  if (trimmed.length === 0) {
    return invalid('XDR is required and cannot be empty.');
  }

  if (!BASE64_PATTERN.test(trimmed)) {
    return invalid('XDR is not valid base64. Expected a base64-encoded transaction envelope.');
  }

  const networkPassphrase = options.networkPassphrase ?? StellarService.getNetwork();

  let transaction: Transaction | FeeBumpTransaction;
  try {
    transaction = TransactionBuilder.fromXDR(trimmed, networkPassphrase);
  } catch (error) {
    return invalid(describeDecodeError(error));
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  return validateEnvelope(transaction, nowSeconds);
}
