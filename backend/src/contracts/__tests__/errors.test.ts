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
      'Batch payment failed: the destination has no trustline for this asset (op_no_trust)'
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
