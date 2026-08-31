import {
  StellarOperationError,
  describeStellarError,
  invalidInput,
  isStellarOperationError,
  toStellarOperationError,
  withMappedHorizonError,
} from '../errors';
import { logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function horizonError(options: {
  status?: number;
  transaction?: string;
  operations?: string[];
  detail?: string;
  title?: string;
}): unknown {
  return {
    response: {
      status: options.status,
      data: {
        title: options.title,
        detail: options.detail,
        extras:
          (options.transaction ?? options.operations)
            ? {
                result_codes: {
                  transaction: options.transaction,
                  operations: options.operations,
                },
              }
            : undefined,
      },
    },
  };
}

describe('toStellarOperationError', () => {
  it('maps an operation result code to an actionable message', () => {
    const mapped = toStellarOperationError(
      'issueAsset',
      horizonError({
        status: 400,
        transaction: 'tx_failed',
        operations: ['op_no_trust'],
      })
    );

    expect(mapped).toBeInstanceOf(StellarOperationError);
    expect(mapped.code).toBe('TRUSTLINE_MISSING');
    expect(mapped.httpStatus).toBe(422);
    expect(mapped.message).toMatch(/no trustline for this asset/);
    expect(mapped.operation).toBe('issueAsset');
    expect(mapped.resultCodes).toEqual({
      transaction: 'tx_failed',
      operations: ['op_no_trust'],
    });
  });

  it('skips op_success entries and reports the operation that actually failed', () => {
    const mapped = toStellarOperationError(
      'issueAsset',
      horizonError({
        status: 400,
        operations: ['op_success', 'op_underfunded'],
      })
    );

    expect(mapped.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('maps op_invalid_limit to a revocation-specific message', () => {
    const mapped = toStellarOperationError(
      'revokeTrustline',
      horizonError({ status: 400, operations: ['op_invalid_limit'] })
    );

    expect(mapped.code).toBe('TRUSTLINE_HAS_BALANCE');
    expect(mapped.httpStatus).toBe(409);
  });

  it('falls back to the transaction result code when no operation matches', () => {
    const mapped = toStellarOperationError(
      'submitPayment',
      horizonError({ status: 400, transaction: 'tx_bad_seq' })
    );

    expect(mapped.code).toBe('BAD_SEQUENCE');
    expect(mapped.httpStatus).toBe(409);
  });

  it('maps tx_bad_auth to a missing-signature message for multi-sig submissions', () => {
    const mapped = toStellarOperationError(
      'submitSignedXdr',
      horizonError({ status: 400, transaction: 'tx_bad_auth' })
    );

    expect(mapped.code).toBe('MISSING_SIGNATURES');
    expect(mapped.message).toMatch(/enough valid signatures/);
  });

  it('maps a 404 with no result codes to ACCOUNT_NOT_FOUND', () => {
    const mapped = toStellarOperationError('loadAccount', horizonError({ status: 404 }));

    expect(mapped.code).toBe('ACCOUNT_NOT_FOUND');
    expect(mapped.httpStatus).toBe(404);
  });

  it('maps a 429 to RATE_LIMITED', () => {
    const mapped = toStellarOperationError('loadAccount', horizonError({ status: 429 }));

    expect(mapped.code).toBe('RATE_LIMITED');
  });

  it('maps any other 5xx to HORIZON_UNAVAILABLE', () => {
    const mapped = toStellarOperationError('loadAccount', horizonError({ status: 503 }));

    expect(mapped.code).toBe('HORIZON_UNAVAILABLE');
    expect(mapped.httpStatus).toBe(503);
  });

  it('includes the Horizon detail string when nothing else matches', () => {
    const mapped = toStellarOperationError(
      'loadAccount',
      horizonError({ status: 418, detail: 'Something odd happened' })
    );

    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.message).toBe('Stellar network error: Something odd happened');
  });

  it('never surfaces a raw error for a non-Horizon throw', () => {
    const mapped = toStellarOperationError('loadAccount', new Error('socket hang up'));

    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.message).toBe('Stellar network error. Please try again later.');
    expect(mapped.cause).toBeInstanceOf(Error);
  });

  it('passes an already-mapped error through unchanged', () => {
    const original = new StellarOperationError({
      operation: 'revokeTrustline',
      code: 'TRUSTLINE_HAS_BALANCE',
      message: 'nope',
      httpStatus: 409,
    });

    expect(toStellarOperationError('outer', original)).toBe(original);
  });
});

describe('isStellarOperationError', () => {
  it('recognises mapped errors and rejects plain ones', () => {
    expect(isStellarOperationError(toStellarOperationError('op', new Error('x')))).toBe(true);
    expect(isStellarOperationError(new Error('x'))).toBe(false);
    expect(isStellarOperationError(undefined)).toBe(false);
  });
});

describe('describeStellarError', () => {
  it('exposes only the log-safe fields', () => {
    const mapped = toStellarOperationError(
      'issueAsset',
      horizonError({ status: 400, operations: ['op_underfunded'] })
    );

    expect(Object.keys(describeStellarError(mapped)).sort()).toEqual([
      'code',
      'httpStatus',
      'operation',
      'reason',
      'resultCodes',
    ]);
    expect(describeStellarError(mapped)).not.toHaveProperty('cause');
    expect(describeStellarError(mapped)).not.toHaveProperty('message');
  });
});

describe('withMappedHorizonError', () => {
  const mockError = logger.error as jest.Mock;

  beforeEach(() => {
    mockError.mockReset();
  });

  it('returns the action result and logs nothing on success', async () => {
    const result = await withMappedHorizonError('loadAccount', { publicKey: 'GABC' }, () =>
      Promise.resolve('ok')
    );

    expect(result).toBe('ok');
    expect(mockError).not.toHaveBeenCalled();
  });

  it('maps the failure and logs the context alongside the mapped fields', async () => {
    const failing = (): Promise<never> =>
      Promise.reject(horizonError({ status: 400, operations: ['op_no_trust'] }));

    await expect(
      withMappedHorizonError('issueAsset', { assetCode: 'ECO' }, failing)
    ).rejects.toMatchObject({ code: 'TRUSTLINE_MISSING' });

    expect(mockError).toHaveBeenCalledWith(
      'Stellar operation failed',
      expect.objectContaining({
        assetCode: 'ECO',
        code: 'TRUSTLINE_MISSING',
        httpStatus: 422,
      })
    );
  });
});

describe('invalidInput', () => {
  it('builds a 400 without touching Horizon', () => {
    const error = invalidInput('issueAsset', 'assetCode must be alphanumeric.');

    expect(error.code).toBe('INVALID_INPUT');
    expect(error.httpStatus).toBe(400);
    expect(error.message).toBe('assetCode must be alphanumeric.');
    expect(error.resultCodes).toBeUndefined();
import { StellarError, extractResultCodes, toStellarError, withStellarErrors } from '../errors';

/** Builds the shape the Stellar SDK attaches to a `NetworkError`. */
function horizonError(
  status: number,
  data?: unknown
): { response: { status: number; data?: unknown } } {
  return { response: { status, ...(data !== undefined && { data }) } };
}

function transactionFailed(transaction: string, operations?: string[]): unknown {
  return horizonError(400, {
    title: 'Transaction Failed',
    extras: { result_codes: { transaction, ...(operations && { operations }) } },
  });
}

describe('extractResultCodes', () => {
  it('reads transaction and operation codes from a Horizon error body', () => {
    expect(extractResultCodes(transactionFailed('tx_failed', ['op_underfunded']))).toEqual({
      transaction: 'tx_failed',
      operations: ['op_underfunded'],
    });
  });

  it('returns undefined when the error carries no result codes', () => {
    expect(extractResultCodes(horizonError(503))).toBeUndefined();
    expect(extractResultCodes(new Error('socket hang up'))).toBeUndefined();
    expect(extractResultCodes(null)).toBeUndefined();
  });
});

describe('toStellarError', () => {
  it('maps an operation result code to an actionable message and keeps the code', () => {
    const error = toStellarError(transactionFailed('tx_failed', ['op_underfunded']), 'Payment');

    expect(error).toBeInstanceOf(StellarError);
    expect(error.status).toBe(400);
    expect(error.message).toBe(
      'Payment failed: the source account does not hold enough of the asset (op_underfunded)'
    );
    expect(error.resultCodes).toEqual({
      transaction: 'tx_failed',
      operations: ['op_underfunded'],
    });
  });

  it('skips successful operations and reports the one that failed', () => {
    const error = toStellarError(
      transactionFailed('tx_failed', ['op_success', 'op_no_trust']),
      'Batch payment'
    );

    expect(error.message).toBe(
      'Batch payment failed: the target account has no trustline for this asset (op_no_trust)'
    );
  });

  it('falls back to the transaction code when no operation failed', () => {
    const error = toStellarError(transactionFailed('tx_bad_seq'), 'Payment');

    expect(error.message).toBe(
      'Payment failed: the account sequence number was stale; rebuild and retry the transaction (tx_bad_seq)'
    );
  });

  it('names the code even when the mapping table does not know it', () => {
    const error = toStellarError(transactionFailed('tx_failed', ['op_brand_new']), 'Payment');

    expect(error.message).toBe(
      'Payment failed: the operation was rejected by the network (op_brand_new)'
    );
  });

  it('explains a missing account for a 404', () => {
    const error = toStellarError(horizonError(404), 'Payment');

    expect(error.status).toBe(404);
    expect(error.message).toContain('was not found on this Stellar network');
  });

  it('explains rate limiting for a 429', () => {
    const error = toStellarError(horizonError(429), 'Payment');

    expect(error.status).toBe(429);
    expect(error.message).toContain('rate limit exceeded');
  });

  it('reports upstream failures as a gateway error', () => {
    const error = toStellarError(
      horizonError(500, { detail: 'upstream request failed' }),
      'Payment'
    );

    expect(error.status).toBe(502);
    expect(error.message).toBe('Payment failed: upstream request failed');
  });

  it('wraps transport failures that never reached Horizon', () => {
    const error = toStellarError(new Error('socket hang up'), 'Payment');

    expect(error.status).toBe(502);
    expect(error.message).toBe('Payment failed: socket hang up');
  });

  it('preserves the Horizon response so the API error mapper still works', () => {
    const original = transactionFailed('tx_failed', ['op_underfunded']);
    const error = toStellarError(original, 'Payment');

    expect(error.response).toEqual((original as { response: unknown }).response);
    expect((error as { cause?: unknown }).cause).toBe(original);
  });

  it('returns an already mapped error untouched', () => {
    const mapped = new StellarError('Payment failed: nope', { status: 400 });

    expect(toStellarError(mapped, 'Payment')).toBe(mapped);
  });
});

describe('withStellarErrors', () => {
  it('passes the resolved value through', async () => {
    await expect(withStellarErrors('Payment', () => Promise.resolve('hash'))).resolves.toBe('hash');
  });

  it('maps a rejection into a StellarError', async () => {
    await expect(
      withStellarErrors('Payment', () => Promise.reject(horizonError(404)))
    ).rejects.toBeInstanceOf(StellarError);
  });
});
