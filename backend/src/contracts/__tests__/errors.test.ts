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
  });
});
