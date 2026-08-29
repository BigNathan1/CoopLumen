import { Memo } from '@stellar/stellar-sdk';

/** Stellar caps a text memo at 28 bytes of UTF-8, not 28 characters. */
export const TEXT_MEMO_MAX_BYTES = 28;

/** A hash memo is exactly 32 bytes, supplied here as 64 hex characters. */
export const HASH_MEMO_HEX_LENGTH = 64;

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Memo accepted by every transaction builder in this layer.
 *
 * A bare string is treated as a text memo, which is what the builders accepted
 * before hash memos existed, so existing callers keep working unchanged.
 */
export type MemoInput =
  | string
  | { type: 'text'; value: string }
  | { type: 'hash'; value: string }
  | { type: 'none' };

/** Raised when a memo cannot be represented on-chain. Always human-readable. */
export class MemoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoValidationError';
  }
}

function buildTextMemo(value: unknown): Memo {
  if (typeof value !== 'string') {
    throw new MemoValidationError('Text memo value must be a string.');
  }

  const byteLength = Buffer.byteLength(value, 'utf8');
  if (byteLength > TEXT_MEMO_MAX_BYTES) {
    throw new MemoValidationError(
      `Text memo must be ${TEXT_MEMO_MAX_BYTES} bytes or fewer when UTF-8 encoded (got ${byteLength}).`
    );
  }

  return Memo.text(value);
}

function buildHashMemo(value: unknown): Memo {
  if (typeof value !== 'string') {
    throw new MemoValidationError('Hash memo value must be a string.');
  }

  const normalised = value.trim().toLowerCase();

  if (normalised.length !== HASH_MEMO_HEX_LENGTH || !HEX_PATTERN.test(normalised)) {
    throw new MemoValidationError(
      `Hash memo must be exactly ${HASH_MEMO_HEX_LENGTH} hexadecimal characters (32 bytes).`
    );
  }

  return Memo.hash(normalised);
}

/**
 * Converts a caller-supplied memo into a Stellar `Memo`, or `undefined` when no
 * memo should be attached.
 *
 * Validation happens here rather than at the network boundary so a bad memo
 * fails fast with a clear message, instead of costing a Horizon round trip and
 * coming back as an opaque `tx_malformed`.
 *
 * @throws {MemoValidationError} when the memo cannot be represented on-chain.
 */
export function buildMemo(memo?: MemoInput | null): Memo | undefined {
  if (memo === undefined || memo === null) {
    return undefined;
  }

  if (typeof memo === 'string') {
    // A bare empty string means "no memo", matching the previous behaviour.
    return memo.length === 0 ? undefined : buildTextMemo(memo);
  }

  switch (memo.type) {
    case 'none':
      return undefined;
    case 'text':
      return buildTextMemo(memo.value);
    case 'hash':
      return buildHashMemo(memo.value);
    default: {
      const { type } = memo as { type: string };
      throw new MemoValidationError(
        `Unsupported memo type "${type}". Supported types are "text", "hash" and "none".`
      );
    }
  }
}
