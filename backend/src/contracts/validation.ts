/**
 * Pre-flight parameter checks shared by the `contracts/` wrappers.
 *
 * Catching a malformed key, asset code, or amount here turns what would be a
 * Horizon round trip ending in an opaque `op_malformed` — or an unlabelled
 * throw from deep inside the SDK — into an `INVALID_INPUT` error naming the
 * offending field.
 */

import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { invalidInput } from './errors';

/** Alphanumeric, 1-12 characters: Stellar's alphanum4 and alphanum12 codes. */
const ASSET_CODE_PATTERN = /^[A-Za-z0-9]{1,12}$/;

/** Non-negative decimal with at most 7 places, matching Stellar's stroop precision. */
const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/;

/** `Memo.text` is capped at 28 bytes on the wire, not 28 characters. */
export const MEMO_MAX_BYTES = 28;

/** Seconds a built transaction stays valid before Horizon rejects it as expired. */
export const TRANSACTION_TIMEOUT_SECONDS = 30;

/** Parses a secret seed into a keypair, or fails with a field-named 400. */
export function parseSecretKey(operation: string, field: string, value: string): Keypair {
  try {
    return Keypair.fromSecret(value);
  } catch {
    throw invalidInput(operation, `${field} is not a valid Stellar secret key.`);
  }
}

export function assertPublicKey(operation: string, field: string, value: string): void {
  if (!StrKey.isValidEd25519PublicKey(value)) {
    throw invalidInput(operation, `${field} is not a valid Stellar public key.`);
  }
}

export function assertAssetCode(operation: string, field: string, value: string): void {
  if (!ASSET_CODE_PATTERN.test(value)) {
    throw invalidInput(
      operation,
      `${field} must be 1-12 alphanumeric characters (Stellar alphanum4 or alphanum12).`
    );
  }
}

export function assertPositiveAmount(operation: string, field: string, value: string): void {
  if (!AMOUNT_PATTERN.test(value) || Number(value) <= 0) {
    throw invalidInput(
      operation,
      `${field} must be a positive decimal string with at most 7 decimal places.`
    );
  }
}

/** Like `assertPositiveAmount`, but `0` is allowed — a zero trustline limit. */
export function assertNonNegativeAmount(operation: string, field: string, value: string): void {
  if (!AMOUNT_PATTERN.test(value)) {
    throw invalidInput(
      operation,
      `${field} must be a non-negative decimal string with at most 7 decimal places.`
    );
  }
}

export function assertMemoLength(operation: string, memo: string | undefined): void {
  if (memo !== undefined && Buffer.byteLength(memo, 'utf8') > MEMO_MAX_BYTES) {
    throw invalidInput(
      operation,
      `memo must be ${MEMO_MAX_BYTES} bytes or fewer when UTF-8 encoded.`
    );
  }
}
