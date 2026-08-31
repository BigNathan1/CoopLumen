/**
 * Contracts-layer error mapping.
 *
 * Horizon reports failures as opaque result codes (`op_underfunded`,
 * `tx_bad_seq`, ...) buried in `error.response.data.extras.result_codes`.
 * Surfacing those raw makes every caller re-learn Stellar's vocabulary, so the
 * wrapper layer normalises them into a `StellarOperationError` carrying a
 * stable machine code, an actionable message, and the HTTP status a route
 * handler should answer with.
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

/** Stable, transport-agnostic identifiers callers can branch on. */
export type StellarErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'DESTINATION_NOT_FOUND'
  | 'TRUSTLINE_MISSING'
  | 'TRUSTLINE_LIMIT_EXCEEDED'
  | 'TRUSTLINE_HAS_BALANCE'
  | 'ISSUER_NOT_FOUND'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_RESERVE'
  | 'INSUFFICIENT_FEE'
  | 'NOT_AUTHORIZED'
  | 'BAD_SEQUENCE'
  | 'BAD_AUTH'
  | 'MISSING_SIGNATURES'
  | 'TRANSACTION_EXPIRED'
  | 'MALFORMED_OPERATION'
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'HORIZON_UNAVAILABLE'
  | 'UNKNOWN';

export interface StellarResultCodes {
/** Result codes as returned by Horizon for a failed transaction submission. */
export interface HorizonResultCodes {
  transaction?: string;
  operations?: string[];
}

interface HorizonErrorShape {
  message?: string;
  response?: {
    status?: number;
    data?: {
      title?: string;
      detail?: string;
      extras?: { result_codes?: StellarResultCodes };
    };
  };
}

interface ErrorMapping {
  code: StellarErrorCode;
  message: string;
  httpStatus: number;
}

/**
 * Raised by `contracts/` helpers when Horizon rejects a request. Carries enough
 * context for a route handler to answer without re-parsing Horizon's payload,
 * and keeps the original error under `cause` for debugging.
 */
export class StellarOperationError extends Error {
  readonly operation: string;
  readonly code: StellarErrorCode;
  readonly httpStatus: number;
  readonly resultCodes?: StellarResultCodes;
  readonly cause?: unknown;

  constructor(params: {
    operation: string;
    code: StellarErrorCode;
    message: string;
    httpStatus: number;
    resultCodes?: StellarResultCodes;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'StellarOperationError';
    this.operation = params.operation;
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.resultCodes = params.resultCodes;
    this.cause = params.cause;

    // Restore the prototype chain so `instanceof` survives the ES2020 downlevel
    // emit used by both the build and ts-jest.
    Object.setPrototypeOf(this, StellarOperationError.prototype);
  }
}

const OPERATION_ERRORS: Record<string, ErrorMapping> = {
  op_underfunded: {
    code: 'INSUFFICIENT_BALANCE',
    message: 'Source account does not hold enough of this asset to complete the operation.',
    httpStatus: 422,
  },
  op_no_trust: {
    code: 'TRUSTLINE_MISSING',
    message: 'Destination account has no trustline for this asset; establish one first.',
    httpStatus: 422,
  },
  op_src_no_trust: {
    code: 'TRUSTLINE_MISSING',
    message: 'Source account has no trustline for this asset; establish one first.',
    httpStatus: 422,
  },
  op_line_full: {
    code: 'TRUSTLINE_LIMIT_EXCEEDED',
    message: "Destination account's trustline limit would be exceeded by this amount.",
    httpStatus: 422,
  },
  op_no_destination: {
    code: 'DESTINATION_NOT_FOUND',
    message: 'Destination account does not exist on this network.',
    httpStatus: 404,
  },
  op_not_authorized: {
    code: 'NOT_AUTHORIZED',
    message: 'Account is not authorized by the issuer to hold or transfer this asset.',
    httpStatus: 403,
  },
  op_src_not_authorized: {
    code: 'NOT_AUTHORIZED',
    message: 'Source account is not authorized by the issuer to transfer this asset.',
    httpStatus: 403,
  },
  op_no_issuer: {
    code: 'ISSUER_NOT_FOUND',
    message: 'The asset issuer account does not exist on this network.',
    httpStatus: 404,
  },
  op_invalid_limit: {
    code: 'TRUSTLINE_HAS_BALANCE',
    message:
      'Trustline limit is below the balance currently held; move the balance out before lowering the limit or revoking trust.',
    httpStatus: 409,
  },
  op_low_reserve: {
    code: 'INSUFFICIENT_RESERVE',
    message: 'Account holds too little XLM to meet the minimum reserve for this operation.',
    httpStatus: 422,
  },
  op_malformed: {
    code: 'MALFORMED_OPERATION',
    message: 'Operation is malformed; check the asset code, issuer, and amount.',
    httpStatus: 400,
  },
};

const TRANSACTION_ERRORS: Record<string, ErrorMapping> = {
  tx_bad_seq: {
    code: 'BAD_SEQUENCE',
    message: 'Transaction sequence number is stale; reload the account and retry.',
    httpStatus: 409,
  },
  tx_insufficient_balance: {
    code: 'INSUFFICIENT_BALANCE',
    message: 'Account balance is insufficient to cover the transaction and its fees.',
    httpStatus: 402,
  },
  tx_insufficient_fee: {
    code: 'INSUFFICIENT_FEE',
    message: 'Submitted fee is below the current network minimum; retry with a higher fee.',
    httpStatus: 429,
  },
  tx_bad_auth: {
    code: 'MISSING_SIGNATURES',
    message:
      'Transaction does not carry enough valid signatures to meet the source account threshold.',
    httpStatus: 401,
  },
  tx_bad_auth_extra: {
    code: 'BAD_AUTH',
    message: 'Transaction carries a signature that matches no signer on the account.',
    httpStatus: 401,
  },
  tx_too_late: {
    code: 'TRANSACTION_EXPIRED',
    message: 'Transaction time bounds expired before submission; rebuild and resubmit.',
    httpStatus: 408,
  },
  tx_too_early: {
    code: 'TRANSACTION_EXPIRED',
    message: 'Transaction is not yet valid; its time bounds start in the future.',
    httpStatus: 400,
  },
  tx_no_source_account: {
    code: 'ACCOUNT_NOT_FOUND',
    message: 'Source account does not exist on this network; fund it before submitting.',
    httpStatus: 404,
  },
  tx_missing_operation: {
    code: 'MALFORMED_OPERATION',
    message: 'Transaction contains no operations.',
    httpStatus: 400,
  },
};

const STATUS_ERRORS: Record<number, ErrorMapping> = {
  400: {
    code: 'INVALID_INPUT',
    message: 'Horizon rejected the request as malformed.',
    httpStatus: 400,
  },
  404: {
    code: 'ACCOUNT_NOT_FOUND',
    message: 'Stellar account or asset was not found on this network.',
    httpStatus: 404,
  },
  429: {
    code: 'RATE_LIMITED',
    message: 'Horizon rate limit reached; retry shortly.',
    httpStatus: 429,
  },
  504: {
    code: 'HORIZON_UNAVAILABLE',
    message: 'Horizon timed out while processing the transaction; verify before resubmitting.',
    httpStatus: 504,
  },
};

/** True when `error` is a contracts-layer error that has already been mapped. */
export function isStellarOperationError(error: unknown): error is StellarOperationError {
  return error instanceof StellarOperationError;
}

/**
 * Normalises anything thrown by Horizon or the Stellar SDK into a
 * `StellarOperationError`. Already-mapped errors pass through untouched so a
 * nested wrapper never re-labels a specific failure as a generic one.
 */
export function toStellarOperationError(operation: string, error: unknown): StellarOperationError {
  if (isStellarOperationError(error)) {
    return error;
  }

  const horizonError = (error ?? {}) as HorizonErrorShape;
  const resultCodes = horizonError.response?.data?.extras?.result_codes;

  const failedOperation = resultCodes?.operations?.find(
    (opCode) => OPERATION_ERRORS[opCode] !== undefined
  );
  if (failedOperation) {
    return new StellarOperationError({
      operation,
      ...OPERATION_ERRORS[failedOperation],
      resultCodes,
      cause: error,
    });
  }

  const transactionCode = resultCodes?.transaction;
  if (transactionCode && TRANSACTION_ERRORS[transactionCode]) {
    return new StellarOperationError({
      operation,
      ...TRANSACTION_ERRORS[transactionCode],
      resultCodes,
      cause: error,
    });
  }

  const status = horizonError.response?.status;
  if (status !== undefined && STATUS_ERRORS[status]) {
    return new StellarOperationError({
      operation,
      ...STATUS_ERRORS[status],
      resultCodes,
      cause: error,
    });
  }

  if (status !== undefined && status >= 500) {
    return new StellarOperationError({
      operation,
      code: 'HORIZON_UNAVAILABLE',
      message: 'Horizon is unavailable; retry shortly.',
      httpStatus: 503,
      resultCodes,
      cause: error,
    });
  }

  const detail = horizonError.response?.data?.detail ?? horizonError.response?.data?.title;
  return new StellarOperationError({
    operation,
    code: 'UNKNOWN',
    message: detail
      ? `Stellar network error: ${detail}`
      : 'Stellar network error. Please try again later.',
    httpStatus: 502,
    resultCodes,
    cause: error,
  });
}

/**
 * Reduces a mapped error to the fields that are safe to log. The raw Horizon
 * error carries the full request config, which can include signed envelopes;
 * these fields never do.
 */
export function describeStellarError(error: StellarOperationError): Record<string, unknown> {
  return {
    operation: error.operation,
    code: error.code,
    httpStatus: error.httpStatus,
    // Deliberately not `message`: winston would merge it into the log line's
    // own `message` field and the two would run together.
    reason: error.message,
    resultCodes: error.resultCodes,
  };
}

/**
 * Runs a Horizon call, mapping and logging any failure once. `context` is
 * merged into the log line and must contain only non-secret identifiers
 * (public keys, asset codes, amounts) — never a secret seed.
 */
export async function withMappedHorizonError<T>(
  operation: string,
  context: Record<string, unknown>,
  action: () => Promise<T>
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const mapped = toStellarOperationError(operation, error);
    logger.error('Stellar operation failed', { ...context, ...describeStellarError(mapped) });
    throw mapped;
  }
}

/** Builds a pre-flight validation failure that never reaches Horizon. */
export function invalidInput(operation: string, message: string): StellarOperationError {
  return new StellarOperationError({
    operation,
    code: 'INVALID_INPUT',
    message,
    httpStatus: 400,
  });
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

/** Extracts transaction and operation result codes from a Horizon error response, if present. */
export function extractResultCodes(error: unknown): HorizonResultCodes | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;
  if (!data || typeof data !== 'object') return undefined;

  const extras = (data as { extras?: { result_codes?: unknown } }).extras;
  const resultCodes = extras?.result_codes;
  if (!resultCodes || typeof resultCodes !== 'object') return undefined;

  const txCode = (resultCodes as { transaction?: unknown }).transaction;
  const opCodes = (resultCodes as { operations?: unknown }).operations;

  return {
    ...(typeof txCode === 'string' && { transaction: txCode }),
    ...(Array.isArray(opCodes) && { operations: opCodes.filter((c): c is string => typeof c === 'string') }),
  };
}

/** Maps a raw Horizon or SDK error into a structured `StellarError`. */
export function toStellarError(error: unknown, actionName = 'Operation'): StellarError {
  if (error instanceof StellarError) {
    return error;
  }

  let status = 502;
  let detail: string | undefined;
  let response: HorizonErrorResponse | undefined;

  if (error && typeof error === 'object') {
    const err = error as { response?: { status?: number; statusText?: string; data?: unknown }; message?: string };
    if (err.response) {
      status = err.response.status ?? 502;
      response = {
        status: err.response.status,
        statusText: err.response.statusText,
        data: err.response.data,
      };
      const data = err.response.data as { title?: string; detail?: string } | undefined;
      if (data?.detail) {
        detail = data.detail;
      } else if (data?.title) {
        detail = data.title;
      }
    } else if (err.message) {
      detail = err.message;
    }
  } else if (typeof error === 'string') {
    detail = error;
  }

  const resultCodes = extractResultCodes(error);
  let reason: string | undefined;

  if (resultCodes) {
    if (resultCodes.operations && resultCodes.operations.length > 0) {
      const failedOp = resultCodes.operations.find((code) => code !== 'op_success');
      if (failedOp) {
        reason = OPERATION_MESSAGES[failedOp] ?? `the operation was rejected by the network (${failedOp})`;
      }
    }
    if (!reason && resultCodes.transaction) {
      const txCode = resultCodes.transaction;
      if (txCode !== 'tx_success') {
        reason = TRANSACTION_MESSAGES[txCode] ?? `the transaction was rejected by the network (${txCode})`;
      }
    }
  }

  if (!reason) {
    if (status === 404) {
      reason = 'the requested account or resource was not found on this Stellar network';
    } else if (status === 429) {
      reason = 'rate limit exceeded; please slow down your requests to Horizon';
    } else if (status === 400) {
      reason = detail ?? 'the request was rejected by Horizon';
    } else {
      reason = detail ?? 'an unexpected error occurred while communicating with Horizon';
    }
  }

  const message = `${actionName} failed: ${reason}`;
  return new StellarError(message, {
    status,
    ...(resultCodes && { resultCodes }),
    ...(response && { response }),
    ...(error !== undefined && { cause: error }),
  });
}

/** Wraps an async contract call, mapping any thrown error via `toStellarError`. */
export async function withStellarErrors<T>(actionName: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toStellarError(error, actionName);
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
