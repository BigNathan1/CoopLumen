const mockRedisClient = {
  connect: jest.fn(),
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
  isOpen: false,
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { createClient } from 'redis';
import { redisCache } from '../redis';
import { logger } from '../../utils/logger';

const mockCreateClient = createClient as jest.Mock;
const mockLogger = logger as unknown as { warn: jest.Mock; error: jest.Mock };

function resetCacheInternals(): void {
  (redisCache as unknown as { client: unknown }).client = null;
  (redisCache as unknown as { connectPromise: unknown }).connectPromise = null;
  (redisCache as unknown as { hasLoggedDisabledState: boolean }).hasLoggedDisabledState = false;
}

describe('RedisCacheClient', () => {
  const originalUrl = process.env.REDIS_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setEx.mockResolvedValue(undefined);
    mockRedisClient.del.mockResolvedValue(undefined);
    mockRedisClient.on.mockReturnValue(mockRedisClient);
    mockRedisClient.isOpen = true;
    resetCacheInternals();
  });

  afterAll(() => {
    process.env.REDIS_URL = originalUrl;
  });

  describe('when REDIS_URL is not configured', () => {
    beforeEach(() => {
      delete process.env.REDIS_URL;
    });

    it('get() returns null without connecting', async () => {
      expect(await redisCache.get('some-key')).toBeNull();
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('setEx() and del() are no-ops', async () => {
      await expect(redisCache.setEx('key', 5, 'value')).resolves.toBeUndefined();
      await expect(redisCache.del('key')).resolves.toBeUndefined();
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('logs the disabled state only once across repeated calls', async () => {
      await redisCache.get('a');
      await redisCache.get('b');
      await redisCache.setEx('c', 5, 'v');

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('when REDIS_URL is configured', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://cache.test:6379';
    });

    it('connects lazily on first use and reuses the connection afterwards', async () => {
      await redisCache.get('key-1');
      await redisCache.get('key-2');

      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    });

    it('get() delegates to the underlying client', async () => {
      mockRedisClient.get.mockResolvedValueOnce('cached-value');

      const result = await redisCache.get('balances:GABC');

      expect(result).toBe('cached-value');
      expect(mockRedisClient.get).toHaveBeenCalledWith('balances:GABC');
    });

    it('setEx() delegates to the underlying client with the given TTL', async () => {
      await redisCache.setEx('balances:GABC', 5, '[]');

      expect(mockRedisClient.setEx).toHaveBeenCalledWith('balances:GABC', 5, '[]');
    });

    it('del() delegates to the underlying client', async () => {
      await redisCache.del('balances:GABC');

      expect(mockRedisClient.del).toHaveBeenCalledWith('balances:GABC');
    });

    it('get() swallows a client error and returns null', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('ECONNRESET'));

      await expect(redisCache.get('key')).resolves.toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis get failed',
        expect.objectContaining({ key: 'key' })
      );
    });

    it('setEx() swallows a client error instead of throwing', async () => {
      mockRedisClient.setEx.mockRejectedValueOnce(new Error('WRONGTYPE'));

      await expect(redisCache.setEx('key', 5, 'v')).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis set failed',
        expect.objectContaining({ key: 'key' })
      );
    });

    it('del() swallows a client error instead of throwing', async () => {
      mockRedisClient.del.mockRejectedValueOnce(new Error('ECONNRESET'));

      await expect(redisCache.del('key')).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis delete failed',
        expect.objectContaining({ key: 'key' })
      );
    });

    it('falls back to a disabled (null) client when the connection attempt fails', async () => {
      mockRedisClient.connect.mockRejectedValueOnce(new Error('connection refused'));

      const result = await redisCache.get('key');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis connection failed; cache operations will be skipped',
        expect.objectContaining({ error: 'connection refused' })
      );
    });

    it('retries the connection on a later call after a prior connection failure', async () => {
      mockRedisClient.connect.mockRejectedValueOnce(new Error('connection refused'));
      await redisCache.get('key-1');

      mockRedisClient.connect.mockResolvedValueOnce(undefined);
      mockRedisClient.get.mockResolvedValueOnce('recovered');
      const result = await redisCache.get('key-2');

      expect(result).toBe('recovered');
      expect(mockCreateClient).toHaveBeenCalledTimes(2);
    });

    it('concurrent callers during connection setup share a single connect() call', async () => {
      let resolveConnect: () => void = () => undefined;
      mockRedisClient.connect.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        })
      );
      mockRedisClient.isOpen = false;

      const first = redisCache.get('key-1');
      const second = redisCache.get('key-2');

      resolveConnect();
      mockRedisClient.isOpen = true;
      await Promise.all([first, second]);

      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    });
  });
});
