/**
 * Contracts-layer error mapping.
 *
 * Horizon reports failures as opaque result codes (`op_underfunded`,
 * `tx_bad_seq`, ...) buried in `error.response.data.extras.result_codes`.
 * Surfacing those raw makes every caller re-learn Stellar's vocabulary, so the
 * wrapper layer normalises them into a `StellarOperationError` carrying a
 * stable machine code, an actionable message, and the HTTP status a route
 * handler should answer with.
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
