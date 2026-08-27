import { Account, Keypair } from '@stellar/stellar-sdk';
import { SequenceCache, isBadSequenceError, withSequenceRetry } from '../sequenceCache';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    loadAccount: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockLoadAccount = StellarService.loadAccount as jest.Mock;
const publicKey = Keypair.random().publicKey();

function horizonAccount(sequence: string): { sequenceNumber: () => string } {
  return { sequenceNumber: () => sequence };
}

function badSeqError(): {
  response: { data: { extras: { result_codes: { transaction: string } } } };
} {
  return {
    response: { data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } },
  };
}

describe('SequenceCache', () => {
  beforeEach(() => {
    mockLoadAccount.mockReset();
    (SequenceCache as unknown as { cache: Map<string, unknown> }).cache.clear();
    (SequenceCache as unknown as { queues: Map<string, unknown> }).queues.clear();
  });

  it('loads the account from Horizon once and reuses the cached instance', async () => {
    mockLoadAccount.mockResolvedValue(horizonAccount('100'));

    const first = await SequenceCache.withAccount(publicKey, async (account) =>
      account.sequenceNumber()
    );
    const second = await SequenceCache.withAccount(publicKey, async (account) =>
      account.sequenceNumber()
    );

    expect(mockLoadAccount).toHaveBeenCalledTimes(1);
    expect(first).toBe('100');
    expect(second).toBe('100');
  });

  it('reflects the sequence increment made by a previous caller (as TransactionBuilder would)', async () => {
    mockLoadAccount.mockResolvedValue(horizonAccount('100'));

    await SequenceCache.withAccount(publicKey, async (account) => {
      account.incrementSequenceNumber();
    });
    const sequenceAfter = await SequenceCache.withAccount(publicKey, async (account) =>
      account.sequenceNumber()
    );

    expect(sequenceAfter).toBe('101');
  });

  it('serializes concurrent callers for the same account instead of racing on the same sequence', async () => {
    mockLoadAccount.mockResolvedValue(horizonAccount('100'));
    const observedSequences: string[] = [];

    const call = (): Promise<void> =>
      SequenceCache.withAccount(publicKey, async (account) => {
        observedSequences.push(account.sequenceNumber());
        // Simulate the async gap between reading the sequence and Horizon
        // accepting the built transaction.
        await new Promise((resolve) => setTimeout(resolve, 5));
        account.incrementSequenceNumber();
      });

    await Promise.all([call(), call(), call()]);

    expect(observedSequences.sort()).toEqual(['100', '101', '102']);
    // Concurrent callers share one cached account load.
    expect(mockLoadAccount).toHaveBeenCalledTimes(1);
  });

  it('keeps each account isolated from other accounts', async () => {
    const otherKey = Keypair.random().publicKey();
    mockLoadAccount.mockImplementation((key: string) =>
      Promise.resolve(horizonAccount(key === publicKey ? '100' : '5'))
    );

    const [a, b] = await Promise.all([
      SequenceCache.withAccount(publicKey, async (account) => account.sequenceNumber()),
      SequenceCache.withAccount(otherKey, async (account) => account.sequenceNumber()),
    ]);

    expect(a).toBe('100');
    expect(b).toBe('5');
  });

  it('propagates errors thrown inside the callback and still releases the queue', async () => {
    mockLoadAccount.mockResolvedValue(horizonAccount('100'));

    await expect(
      SequenceCache.withAccount(publicKey, async () => {
        throw new Error('submission failed');
      })
    ).rejects.toThrow('submission failed');

    // The queue was released, so a subsequent call proceeds normally.
    const sequence = await SequenceCache.withAccount(publicKey, async (account) =>
      account.sequenceNumber()
    );
    expect(sequence).toBe('100');
  });

  it('invalidate() forces the next call to reload from Horizon', async () => {
    mockLoadAccount.mockResolvedValueOnce(horizonAccount('100'));
    await SequenceCache.withAccount(publicKey, async () => undefined);

    SequenceCache.invalidate(publicKey);

    mockLoadAccount.mockResolvedValueOnce(horizonAccount('200'));
    const sequence = await SequenceCache.withAccount(publicKey, async (account) =>
      account.sequenceNumber()
    );

    expect(sequence).toBe('200');
    expect(mockLoadAccount).toHaveBeenCalledTimes(2);
  });
});

describe('isBadSequenceError', () => {
  it('returns true for a tx_bad_seq Horizon error', () => {
    expect(isBadSequenceError(badSeqError())).toBe(true);
  });

  it('returns false for other Horizon errors', () => {
    expect(
      isBadSequenceError({
        response: { data: { extras: { result_codes: { transaction: 'tx_insufficient_fee' } } } },
      })
    ).toBe(false);
  });

  it('returns false for a non-Horizon error', () => {
    expect(isBadSequenceError(new Error('boom'))).toBe(false);
  });
});

describe('withSequenceRetry', () => {
  beforeEach(() => {
    mockLoadAccount.mockReset();
    (SequenceCache as unknown as { cache: Map<string, unknown> }).cache.clear();
    (SequenceCache as unknown as { queues: Map<string, unknown> }).queues.clear();
  });

  it('returns the result on the first attempt when nothing fails', async () => {
    mockLoadAccount.mockResolvedValue(horizonAccount('100'));

    const result = await withSequenceRetry(publicKey, async () => 'ok');

    expect(result).toBe('ok');
    expect(mockLoadAccount).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache and retries exactly once on tx_bad_seq', async () => {
    mockLoadAccount.mockResolvedValueOnce(horizonAccount('100'));
    mockLoadAccount.mockResolvedValueOnce(horizonAccount('101'));

    let attempt = 0;
    const result = await withSequenceRetry(publicKey, async (account) => {
      attempt += 1;
      if (attempt === 1) {
        throw badSeqError();
      }
      return account.sequenceNumber();
    });

    expect(result).toBe('101');
    expect(attempt).toBe(2);
    expect(mockLoadAccount).toHaveBeenCalledTimes(2);
  });

  it('propagates a second tx_bad_seq without retrying again', async () => {
    mockLoadAccount.mockResolvedValue(horizonAccount('100'));

    await expect(
      withSequenceRetry(publicKey, async () => {
        throw badSeqError();
      })
    ).rejects.toMatchObject({
      response: { data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } },
    });

    expect(mockLoadAccount).toHaveBeenCalledTimes(2);
  });

  it('propagates non-sequence errors without retrying', async () => {
    mockLoadAccount.mockResolvedValue(horizonAccount('100'));

    await expect(
      withSequenceRetry(publicKey, async () => {
        throw new Error('insufficient balance');
      })
    ).rejects.toThrow('insufficient balance');

    expect(mockLoadAccount).toHaveBeenCalledTimes(1);
  });
});

// Sanity check that the real Account class behaves as assumed above.
describe('Account increment semantics (sdk sanity check)', () => {
  it('increments sequence as a string-safe bigint', () => {
    const account = new Account(publicKey, '9007199254740993');
    account.incrementSequenceNumber();
    expect(account.sequenceNumber()).toBe('9007199254740994');
  });
});
