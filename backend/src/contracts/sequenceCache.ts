import { Account } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { logger } from '../utils/logger';

const SEQUENCE_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  account: Account;
  cachedAt: number;
}

interface HorizonErrorShape {
  response?: {
    data?: {
      extras?: { result_codes?: { transaction?: string } };
    };
  };
}

/** True when the error is a Horizon `tx_bad_seq` rejection. */
export function isBadSequenceError(err: unknown): boolean {
  const horizonErr = err as HorizonErrorShape;
  return horizonErr?.response?.data?.extras?.result_codes?.transaction === 'tx_bad_seq';
}

/**
 * Caches each account's Stellar `Account` object (source of its sequence
 * number) in memory, and serializes concurrent access per account so that
 * two requests submitting transactions for the same source account in quick
 * succession each get a distinct, correctly-incremented sequence number
 * without a redundant `loadAccount` round-trip to Horizon for every request.
 *
 * `TransactionBuilder` mutates the `Account` instance it is given
 * (incrementing its sequence number as part of `build()`), so reusing the
 * same cached instance across calls is what keeps the local sequence in
 * sync with what has actually been submitted.
 */
class SequenceCacheClass {
  private cache = new Map<string, CacheEntry>();
  private queues = new Map<string, Promise<unknown>>();

  /**
   * Runs `fn` with exclusive access to the cached `Account` for `publicKey`.
   * Concurrent callers for the same account are queued so each sees the
   * sequence number left behind by the previous caller's transaction build.
   */
  async withAccount<T>(publicKey: string, fn: (account: Account) => Promise<T>): Promise<T> {
    const previous = this.queues.get(publicKey) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const account = await this.getAccount(publicKey);
        return fn(account);
      });

    this.queues.set(publicKey, run);

    try {
      return await run;
    } finally {
      if (this.queues.get(publicKey) === run) {
        this.queues.delete(publicKey);
      }
    }
  }

  /** Drops the cached sequence for an account, forcing a reload from Horizon on next use. */
  invalidate(publicKey: string): void {
    this.cache.delete(publicKey);
  }

  private async getAccount(publicKey: string): Promise<Account> {
    const cached = this.cache.get(publicKey);
    if (cached && Date.now() - cached.cachedAt < SEQUENCE_CACHE_TTL_MS) {
      return cached.account;
    }

    const horizonAccount = await StellarService.loadAccount(publicKey);
    const account = new Account(publicKey, horizonAccount.sequenceNumber());
    this.cache.set(publicKey, { account, cachedAt: Date.now() });
    return account;
  }
}

export const SequenceCache = new SequenceCacheClass();

/**
 * Runs `buildAndSubmit` with a cached, serialized sequence number for
 * `publicKey`. If Horizon rejects the resulting transaction with
 * `tx_bad_seq` (e.g. the cache drifted from an out-of-band submission), the
 * cache is invalidated and `buildAndSubmit` is retried exactly once against
 * a freshly loaded account.
 */
export async function withSequenceRetry<T>(
  publicKey: string,
  buildAndSubmit: (account: Account) => Promise<T>
): Promise<T> {
  try {
    return await SequenceCache.withAccount(publicKey, buildAndSubmit);
  } catch (err) {
    if (!isBadSequenceError(err)) {
      throw err;
    }

    logger.warn('Sequence number cache was stale; reloading and retrying once', { publicKey });
    SequenceCache.invalidate(publicKey);
    return SequenceCache.withAccount(publicKey, buildAndSubmit);
  }
}
