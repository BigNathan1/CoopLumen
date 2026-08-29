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
