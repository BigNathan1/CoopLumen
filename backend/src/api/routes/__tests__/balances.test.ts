import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';

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
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
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
import { db } from '../../../db';
import { BALANCE_CACHE_TTL_SECONDS, getBalanceCacheKey } from '../../../cache/balances';
import { redisCache } from '../../../cache/redis';
import { StellarService } from '../../../contracts/stellar';

const mockDb = db as jest.Mocked<typeof db>;
const publicKey = Keypair.random().publicKey();
const communityId = '11111111-1111-4111-8111-111111111111';

function setMockServer(server: unknown): void {
  (StellarService as unknown as { server: unknown }).server = server;
}

function runTimeoutsImmediately(): jest.SpyInstance {
  return jest.spyOn(global, 'setTimeout').mockImplementation(((
    callback: (...args: unknown[]) => void
  ) => {
    if (typeof callback === 'function') {
      callback();
    }

    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
}

describe('balance routes', () => {
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

describe('GET /api/v1/balances/:publicKey/loans', () => {
  it('returns paginated loans for the address', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: 'loan-1', borrower_address: publicKey }]);
    const res = await request(app).get(`/api/v1/balances/${publicKey}/loans?page=1&limit=10`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 10, pages: 1, offset: 0 });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

describe('GET /api/v1/balances/community/:communityId/loans', () => {
  it('returns paginated loans for the community', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ id: 'loan-1' }, { id: 'loan-2' }]);
    const res = await request(app).get(`/api/v1/balances/community/${communityId}/loans`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20, pages: 1, offset: 0 });
  describe('GET /api/v1/balances/:publicKey', () => {
    it('returns a validation error for an invalid public key', async () => {
      const response = await request(app).get('/api/v1/balances/not-a-stellar-key');

      expect(response.status).toBe(400);
      expect(response.body.data).toBeNull();
      expect(response.body.error).toBe('Validation failed');
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('returns cached balances on a Redis cache hit', async () => {
      const balances = [{ asset_type: 'native', balance: '25.0000000' }];
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(balances));
      const loadAccount = jest.fn();
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/balances/${publicKey}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(balances);
      expect(mockRedisClient.get).toHaveBeenCalledWith(getBalanceCacheKey(publicKey));
      expect(loadAccount).not.toHaveBeenCalled();
    });

    it('fetches from Horizon and caches balances on a Redis cache miss', async () => {
      const balances = [{ asset_type: 'native', balance: '100.0000000' }];
      mockRedisClient.get.mockResolvedValueOnce(null);
      const loadAccount = jest.fn().mockResolvedValueOnce({ balances });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/balances/${publicKey}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(balances);
      expect(loadAccount).toHaveBeenCalledWith(publicKey);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        getBalanceCacheKey(publicKey),
        BALANCE_CACHE_TTL_SECONDS,
        JSON.stringify(balances)
      );
    });

    it('retries Horizon 429 failures and eventually succeeds', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      mockRedisClient.get.mockResolvedValue(null);
      const balances = [{ asset_type: 'native', balance: '9.0000000' }];
      const loadAccount = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({ balances });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/balances/${publicKey}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(balances);
      expect(loadAccount).toHaveBeenCalledTimes(3);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
    });

    it('retries Horizon 503 failures using Retry-After when provided', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      mockRedisClient.get.mockResolvedValue(null);
      const balances = [{ asset_type: 'native', balance: '18.0000000' }];
      const loadAccount = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 503, headers: { 'retry-after': '0.3' } } })
        .mockResolvedValueOnce({ balances });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/balances/${publicKey}`);

      expect(response.status).toBe(200);
      expect(loadAccount).toHaveBeenCalledTimes(2);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300);
    });

    it('returns a 502 after retry exhaustion on repeated Horizon failures', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      mockRedisClient.get.mockResolvedValue(null);
      const loadAccount = jest
        .fn()
        .mockRejectedValue({ response: { status: 503, data: { detail: 'Horizon unavailable' } } });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/balances/${publicKey}`);

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar network error: Horizon unavailable',
      });
      expect(loadAccount).toHaveBeenCalledTimes(4);
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 400);
    });

    it('returns a 404 for unexpected Horizon lookup failures without caching them', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const loadAccount = jest.fn().mockRejectedValueOnce({ response: { status: 404 } });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/balances/${publicKey}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar account or asset not found.',
      });
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/balances/:publicKey/loans', () => {
    it('returns paginated loans for the address', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{ id: 'loan-1', borrower_address: publicKey }]);

      const response = await request(app).get(
        `/api/v1/balances/${publicKey}/loans?page=1&limit=10`
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 10, pages: 1, offset: 0 });
    });

    it('validates public key and pagination query parameters', async () => {
      const response = await request(app).get('/api/v1/balances/not-a-key/loans?page=0&limit=-1');

      expect(response.status).toBe(400);
      expect(response.body.data).toBeNull();
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/v1/balances/community/:communityId/loans', () => {
    it('returns paginated loans for the community', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([{ id: 'loan-1' }, { id: 'loan-2' }]);

      const response = await request(app).get(`/api/v1/balances/community/${communityId}/loans`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toEqual({ total: 2, page: 1, limit: 20, pages: 1, offset: 0 });
    });

    it('validates the community id and pagination query parameters', async () => {
      const response = await request(app).get(
        '/api/v1/balances/community/not-a-uuid/loans?limit=0'
      );

      expect(response.status).toBe(400);
      expect(response.body.data).toBeNull();
      expect(response.body.error).toBe('Validation failed');
    });
  });
});
