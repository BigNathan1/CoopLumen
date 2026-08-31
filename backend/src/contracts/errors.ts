/**
 * Horizon reports a rejected submission as an HTTP error whose body carries the
 * real reason in `extras.result_codes` (for example `op_underfunded`). Letting
 * that raw shape escape the contracts layer means every caller has to know how
 * to read it, so each Horizon call here is funnelled through `toStellarError`,
 * which produces a `StellarError` carrying:
 *
 * - an actionable message naming what failed and what to do about it,
 * - an HTTP `status` the Express error handler can reuse verbatim,
 * - the parsed `resultCodes` for logging,
 * - the original Horizon `response`, so `api/utils/horizonError.ts` — which
 *   remains the single place that shapes HTTP responses for route handlers —
 *   maps a bubbled-up `StellarError` exactly as it maps a raw Horizon error.
 */

import { logger } from '../utils/logger';

/** Result codes as returned by Horizon for a failed transaction submission. */
export interface HorizonResultCodes {
  transaction?: string;
  operations?: string[];
}

/** The subset of an SDK `NetworkError` response the contracts layer reads. */
export interface HorizonErrorResponse {
  status?: number;
  statusText?: string;
  data?: unknown;
}

export interface StellarErrorOptions {
  status?: number;
  resultCodes?: HorizonResultCodes;
  response?: HorizonErrorResponse;
  cause?: unknown;
}

/**
 * A Horizon or Stellar SDK failure translated into something a caller can act
 * on. `status` is read by the Express error handler, so a mapped error reaches
 * the client with its message intact instead of a generic 500.
 */
export class StellarError extends Error {
  readonly status: number;
  readonly resultCodes?: HorizonResultCodes;
  readonly response?: HorizonErrorResponse;

  constructor(message: string, options: StellarErrorOptions = {}) {
    super(message);
    this.name = 'StellarError';
    this.status = options.status ?? 502;
    if (options.resultCodes) {
      this.resultCodes = options.resultCodes;
    }
    if (options.response) {
      this.response = options.response;
    }
    if (options.cause !== undefined) {
      // `cause` landed in ES2022; assign it defensively so the ES2020 build keeps it.
      (this as { cause?: unknown }).cause = options.cause;
    }
    // Required for `instanceof` to hold when the class is transpiled to ES5/ES2020.
      (this as { cause?: unknown }).cause = options.cause;
    }
    // Required for `instanceof` to hold when the class is transpiled to ES5/ES2020.
    Object.setPrototypeOf(this, StellarError.prototype);
  }
}

/** Transaction-level result codes Horizon can report for a rejected submission. */
const TRANSACTION_MESSAGES: Record<string, string> = {
  tx_failed: 'one or more operations in the transaction failed',
  tx_bad_seq: 'the account sequence number was stale; rebuild and retry the transaction',
  tx_bad_auth: 'the transaction is missing a required signature',
  tx_bad_auth_extra: 'the transaction carries a signature that is not needed',
  tx_insufficient_balance: 'the source account cannot pay the fee and keep its minimum XLM reserve',
  tx_insufficient_fee: 'the fee is below the current network minimum; retry with a higher fee',
  tx_no_source_account: 'the source account does not exist on this network',
  tx_too_early: 'the transaction time bounds start in the future',
  tx_too_late: 'the transaction time bounds have expired; rebuild and resubmit it',
  tx_missing_operation: 'the transaction contains no operations',
  tx_internal_error: 'Horizon reported an internal error; retry the transaction',
  tx_not_supported: 'the network does not support this transaction',
};

/** Operation-level result codes shared across payment, trust and flag operations. */
const OPERATION_MESSAGES: Record<string, string> = {
  op_underfunded: 'the source account does not hold enough of the asset',
  op_no_destination: 'the destination account does not exist on this network',
  op_no_trust: 'the target account has no trustline for this asset',
  op_not_authorized: 'the target account is not authorized to hold this asset',
  op_src_no_trust: 'the source account has no trustline for this asset',
  op_src_not_authorized: 'the source account is not authorized to send this asset',
  op_line_full: 'the destination trustline limit would be exceeded',
  op_no_issuer: 'the asset issuer account does not exist on this network',
  op_low_reserve: 'the account does not hold enough XLM to meet the minimum reserve',
  op_malformed: 'the operation parameters are invalid',
  op_invalid_limit: 'the requested trustline limit is below the current balance',
  op_self_not_allowed: 'an account cannot create a trustline to its own asset',
  op_no_trust_line: 'the target account has no trustline for this asset',
  op_cant_revoke: 'the issuer cannot revoke authorization because it is not set as revocable',
  op_invalid_state: 'the requested flag combination is not valid for this trustline',
  op_immutable_set: 'the issuer account is immutable, so its flags cannot be changed',
  op_cross_self: 'the operation would trade the account against itself',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Pulls the Horizon response off an SDK `NetworkError`. Structural rather than
 * `instanceof` based, because Horizon errors reach us through several SDK
 * subclasses and, in tests, as plain objects of the same shape.
 */
export function getHorizonResponse(err: unknown): HorizonErrorResponse | undefined {
  return asRecord(asRecord(err)?.response);
}

/** Extracts `extras.result_codes` from a Horizon error body, when present. */
export function extractResultCodes(err: unknown): HorizonResultCodes | undefined {
  const extras = asRecord(asRecord(getHorizonResponse(err)?.data)?.extras);
  const codes = asRecord(extras?.result_codes);
  if (!codes) {
    return undefined;
  }

  const transaction = typeof codes.transaction === 'string' ? codes.transaction : undefined;
  const operations = Array.isArray(codes.operations)
    ? codes.operations.filter((code): code is string => typeof code === 'string')
    : undefined;

  if (transaction === undefined && operations === undefined) {
    return undefined;
  }
  return { ...(transaction && { transaction }), ...(operations && { operations }) };
}

/** The first operation code that actually failed, ignoring the successful ones. */
function firstFailedOperation(operations?: string[]): string | undefined {
  return operations?.find((code) => code !== 'op_success' && code !== '');
}

function describeResultCodes(codes: HorizonResultCodes): string | undefined {
  const failedOperation = firstFailedOperation(codes.operations);
  if (failedOperation) {
    const detail =
      OPERATION_MESSAGES[failedOperation] ?? 'the operation was rejected by the network';
    return `${detail} (${failedOperation})`;
  }
  if (codes.transaction && codes.transaction !== 'tx_success') {
    const detail = TRANSACTION_MESSAGES[codes.transaction] ?? 'the transaction was rejected';
    return `${detail} (${codes.transaction})`;
  }
  return undefined;
}

/** Maps the upstream Horizon status onto the status this API answers with. */
function mapStatus(horizonStatus: number | undefined): number {
  switch (horizonStatus) {
    case 400:
      return 400;
    case 404:
      return 404;
    case 429:
      return 429;
    default:
      // 5xx responses, timeouts and transport failures are upstream problems
      // rather than the caller's, so they surface as a gateway error.
      return 502;
  }
}

/**
 * Normalises anything thrown by the Stellar SDK or Horizon into a `StellarError`.
 *
 * @param err    The value caught from an SDK call.
 * @param action Human-readable action used as the message prefix, e.g. `'Payment'`.
 */
export function toStellarError(err: unknown, action: string): StellarError {
  if (err instanceof StellarError) {
    return err;
  }

  const response = getHorizonResponse(err);
  const resultCodes = extractResultCodes(err);
  const status = mapStatus(response?.status);
  const base = { status, ...(response && { response }), cause: err };

  if (response?.status === 404) {
    return new StellarError(
      `${action} failed: the account was not found on this Stellar network. Fund the account before using it.`,
      base
    );
  }

  if (response?.status === 429) {
    return new StellarError(
      `${action} failed: Horizon rate limit exceeded. Retry after a short delay.`,
      base
    );
  }

  const detail = resultCodes ? describeResultCodes(resultCodes) : undefined;
  if (detail) {
    return new StellarError(`${action} failed: ${detail}`, { ...base, resultCodes });
  }

  if (response) {
    const data = asRecord(response.data);
    const summary =
      typeof data?.detail === 'string'
        ? data.detail
        : typeof data?.title === 'string'
          ? data.title.toLowerCase()
          : (response.statusText ?? 'Horizon returned an error');
    return new StellarError(`${action} failed: ${summary}`, {
      ...base,
      ...(resultCodes && { resultCodes }),
    });
  }

  const message = err instanceof Error ? err.message : String(err);
  return new StellarError(`${action} failed: ${message}`, { status: 502, cause: err });
}

/**
 * Wraps a Horizon call so any failure comes back as a `StellarError`, keeping
 * call sites free of repeated try/catch blocks.
 */
export async function withStellarErrors<T>(action: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toStellarError(err, action);
  op_bad_auth: 'the operation is missing a required signature',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Pulls the Horizon response off an SDK `NetworkError`. Structural rather than
 * `instanceof` based, because Horizon errors reach us through several SDK
 * subclasses and, in tests, as plain objects of the same shape.
 */
export function getHorizonResponse(err: unknown): HorizonErrorResponse | undefined {
  return asRecord(asRecord(err)?.response);
}

/** Extracts `extras.result_codes` from a Horizon error body, when present. */
export function extractResultCodes(err: unknown): HorizonResultCodes | undefined {
  const extras = asRecord(asRecord(getHorizonResponse(err)?.data)?.extras);
  const codes = asRecord(extras?.result_codes);
  if (!codes) {
    return undefined;
  }

  const transaction = typeof codes.transaction === 'string' ? codes.transaction : undefined;
  const operations = Array.isArray(codes.operations)
    ? codes.operations.filter((code): code is string => typeof code === 'string')
    : undefined;

  if (transaction === undefined && operations === undefined) {
    return undefined;
  }
  return { ...(transaction && { transaction }), ...(operations && { operations }) };
}

/** The first operation code that actually failed, ignoring the successful ones. */
function firstFailedOperation(operations?: string[]): string | undefined {
  return operations?.find((code) => code !== 'op_success' && code !== '');
}

function describeResultCodes(codes: HorizonResultCodes): string | undefined {
  const failedOperation = firstFailedOperation(codes.operations);
  if (failedOperation) {
    const detail =
      OPERATION_MESSAGES[failedOperation] ?? 'the operation was rejected by the network';
    return `${detail} (${failedOperation})`;
  }
  if (codes.transaction && codes.transaction !== 'tx_success') {
    const detail = TRANSACTION_MESSAGES[codes.transaction] ?? 'the transaction was rejected';
    return `${detail} (${codes.transaction})`;
  }
  return undefined;
}

/** Maps the upstream Horizon status onto the status this API answers with. */
function mapStatus(horizonStatus: number | undefined): number {
  switch (horizonStatus) {
    case 400:
      return 400;
    case 404:
      return 404;
    case 429:
      return 429;
    default:
      // 5xx responses, timeouts and transport failures are upstream problems
      // rather than the caller's, so they surface as a gateway error.
      return 502;
  }
}

/**
 * Normalises anything thrown by the Stellar SDK or Horizon into a `StellarError`.
 *
 * @param err    The value caught from an SDK call.
 * @param action Human-readable action used as the message prefix, e.g. `'Payment'`.
 */
export function toStellarError(err: unknown, action: string): StellarError {
  if (err instanceof StellarError) {
    return err;
  }

  const response = getHorizonResponse(err);
  const resultCodes = extractResultCodes(err);
  const status = mapStatus(response?.status);
  const base = { status, ...(response && { response }), cause: err };

  if (response?.status === 404) {
    return new StellarError(
      `${action} failed: the account was not found on this Stellar network. Fund the account before using it.`,
      base
    );
  }

  if (response?.status === 429) {
    return new StellarError(
      `${action} failed: Horizon rate limit exceeded. Retry after a short delay.`,
      base
    );
  }

  const detail = resultCodes ? describeResultCodes(resultCodes) : undefined;
  if (detail) {
    return new StellarError(`${action} failed: ${detail}`, { ...base, resultCodes });
  }

  if (response) {
    const data = asRecord(response.data);
    const summary =
      typeof data?.detail === 'string'
        ? data.detail
        : typeof data?.title === 'string'
          ? data.title.toLowerCase()
          : (response.statusText ?? 'Horizon returned an error');
    return new StellarError(`${action} failed: ${summary}`, {
      ...base,
      ...(resultCodes && { resultCodes }),
    });
  }

  const message = err instanceof Error ? err.message : String(err);
  return new StellarError(`${action} failed: ${message}`, { status: 502, cause: err });
}

/**
 * Wraps a Horizon call so any failure comes back as a `StellarError`, keeping
 * call sites free of repeated try/catch blocks.
 */
export async function withStellarErrors<T>(action: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toStellarError(err, action);
  }
}

/**
 * Builds a pre-flight validation failure that never reaches Horizon — for a
 * malformed key, asset code, or amount caught before the network call it
 * would otherwise fail as an opaque `op_malformed`.
 */
export function invalidInput(action: string, detail: string): StellarError {
  return new StellarError(`${action} failed: ${detail}`, { status: 400 });
}

/**
 * Like {@link withStellarErrors}, but also logs the failure with the given
 * context — for call sites where a route handler or caller needs a structured
 * log line (public identifiers, amounts, ...) alongside the mapped error.
 * The context should never include secrets.
 */
export async function withMappedHorizonError<T>(
  action: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const mapped = toStellarError(err, action);
    logger.error('Stellar operation failed', {
      ...context,
      message: mapped.message,
      status: mapped.status,
    });
    throw mapped;
  }
}
