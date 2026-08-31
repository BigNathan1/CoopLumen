const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
  isOpen: true,
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { Keypair } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import {
  BALANCE_CACHE_TTL_SECONDS,
  getBalanceCacheKey,
  getCachedBalances,
  cacheBalances,
  invalidateBalanceCache,
} from '../balances';
import { redisCache } from '../redis';
import { logger } from '../../utils/logger';

const mockLogger = logger as unknown as { warn: jest.Mock };

function resetCacheInternals(): void {
  (redisCache as unknown as { client: unknown }).client = null;
  (redisCache as unknown as { connectPromise: unknown }).connectPromise = null;
  (redisCache as unknown as { hasLoggedDisabledState: boolean }).hasLoggedDisabledState = false;
}

const nativeBalances: Horizon.HorizonApi.BalanceLine[] = [
  { asset_type: 'native', balance: '100.0000000' } as Horizon.HorizonApi.BalanceLine,
];

describe('balance cache module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://cache.test:6379';
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setEx.mockResolvedValue(undefined);
    mockRedisClient.del.mockResolvedValue(undefined);
    mockRedisClient.isOpen = true;
    resetCacheInternals();
  });

  describe('getBalanceCacheKey', () => {
    it('namespaces the key by public key', () => {
      expect(getBalanceCacheKey('GABC')).toBe('balances:GABC');
    });
  });

  describe('cacheBalances / getCachedBalances round trip', () => {
    it('returns null on a cache miss', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await getCachedBalances('GABC');

      expect(result).toBeNull();
      expect(mockRedisClient.get).toHaveBeenCalledWith('balances:GABC');
    });

    it('caches balances with the configured TTL under the namespaced key', async () => {
      const publicKey = Keypair.random().publicKey();

      await cacheBalances(publicKey, nativeBalances);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        getBalanceCacheKey(publicKey),
        BALANCE_CACHE_TTL_SECONDS,
        JSON.stringify(nativeBalances)
      );
    });

    it('returns previously cached balances, parsed back into an array', async () => {
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(nativeBalances));

      const result = await getCachedBalances('GABC');

      expect(result).toEqual(nativeBalances);
    });
  });

  describe('malformed cache payload handling', () => {
    it('discards a non-array payload and deletes the key', async () => {
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({ not: 'an array' }));

      const result = await getCachedBalances('GABC');

      expect(result).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalledWith('balances:GABC');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Discarding malformed cached balance payload',
        expect.objectContaining({ key: 'balances:GABC' })
      );
    });

    it('discards unparsable JSON and deletes the key', async () => {
      mockRedisClient.get.mockResolvedValueOnce('not-json{{{');

      const result = await getCachedBalances('GABC');

      expect(result).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalledWith('balances:GABC');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Discarding unreadable cached balance payload',
        expect.objectContaining({ key: 'balances:GABC' })
      );
    });
  });

  describe('invalidateBalanceCache', () => {
    it('deletes the cache key for a single address', async () => {
      await invalidateBalanceCache(['GABC']);

      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith('balances:GABC');
    });

    it('deletes cache keys for multiple distinct addresses', async () => {
      await invalidateBalanceCache(['GABC', 'GDEF']);

      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.del).toHaveBeenCalledWith('balances:GABC');
      expect(mockRedisClient.del).toHaveBeenCalledWith('balances:GDEF');
    });

    it('de-duplicates repeated addresses into a single delete', async () => {
      await invalidateBalanceCache(['GABC', 'GABC', 'GABC']);

      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
    });

    it('ignores undefined entries without deleting anything for them', async () => {
      await invalidateBalanceCache([undefined, 'GABC', undefined]);

      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith('balances:GABC');
    });

    it('is a no-op when every entry is undefined', async () => {
      await invalidateBalanceCache([undefined, undefined]);

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('when Redis is unreachable', () => {
    it('getCachedBalances resolves to null instead of throwing', async () => {
      delete process.env.REDIS_URL;
      resetCacheInternals();

      await expect(getCachedBalances('GABC')).resolves.toBeNull();
    });

    it('cacheBalances resolves without throwing', async () => {
      delete process.env.REDIS_URL;
      resetCacheInternals();

      await expect(cacheBalances('GABC', nativeBalances)).resolves.toBeUndefined();
    });

    it('invalidateBalanceCache resolves without throwing', async () => {
      delete process.env.REDIS_URL;
      resetCacheInternals();

      await expect(invalidateBalanceCache(['GABC'])).resolves.toBeUndefined();
    });
  });
});
