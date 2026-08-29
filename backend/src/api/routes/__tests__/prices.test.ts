import request from 'supertest';

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

jest.mock('../../../db', () => ({
  db: {
    ping: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../../contracts/stellar', () => ({
  StellarService: {
    ping: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import app from '../../../app';
import { PRICE_CACHE_TTL_SECONDS, getPriceCacheKey } from '../../../cache/prices';
import { redisCache } from '../../../cache/redis';

describe('prices routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://cache.test:6379';
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setEx.mockResolvedValue(undefined);
    mockRedisClient.del.mockResolvedValue(undefined);
    mockRedisClient.on.mockReturnValue(mockRedisClient);
    mockRedisClient.isOpen = true;
    (redisCache as unknown as { client: unknown }).client = null;
    (redisCache as unknown as { connectPromise: unknown }).connectPromise = null;
    (redisCache as unknown as { hasLoggedDisabledState: boolean }).hasLoggedDisabledState = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/v1/prices/xlm', () => {
    it('returns cached XLM/USD price on a Redis cache hit', async () => {
      const cachedPrice = {
        asset: 'XLM',
        currency: 'USD',
        price: '0.1890000',
        source: 'coingecko',
        timestamp: '2026-08-27T16:00:00.000Z',
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cachedPrice));

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: cachedPrice });
      expect(mockRedisClient.get).toHaveBeenCalledWith(getPriceCacheKey('XLM', 'USD'));
    });

    it('fetches from public provider on cache miss and stores in Redis', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stellar: { usd: 0.1885 } }),
      } as Response);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        asset: 'XLM',
        currency: 'USD',
        price: '0.1885000',
        source: 'coingecko',
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        getPriceCacheKey('XLM', 'USD'),
        PRICE_CACHE_TTL_SECONDS,
        expect.any(String)
      );
    });

    it('supports custom currency query parameter and caches under currency key', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stellar: { eur: 0.165 } }),
      } as Response);

      const response = await request(app).get('/api/v1/prices/xlm?currency=EUR');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        asset: 'XLM',
        currency: 'EUR',
        price: '0.1650000',
        source: 'coingecko',
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.get).toHaveBeenCalledWith(getPriceCacheKey('XLM', 'EUR'));
    });

    it('returns validation error for invalid currency query parameter', async () => {
      const response = await request(app).get('/api/v1/prices/xlm?currency=TOOLONG123');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: [
            {
              path: 'currency',
              message: 'currency must be a valid 3- or 4-letter currency code',
            },
          ],
        },
      });
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('falls back to secondary provider when primary provider fails', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      // 1st call (CoinGecko) fails, 2nd call (Binance) succeeds
      const mockFetch = jest
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('CoinGecko timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ price: '0.1889000' }),
        } as Response);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        asset: 'XLM',
        currency: 'USD',
        price: '0.1889000',
        source: 'binance',
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns 502 Bad Gateway when all public price feeds fail', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network offline'));

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        data: null,
        error: 'Failed to fetch price from public source.',
      });
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });
  });
});
