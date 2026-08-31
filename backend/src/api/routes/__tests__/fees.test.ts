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
import { StellarService } from '../../../contracts/stellar';
import { redisCache } from '../../../cache/redis';

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

const MOCK_FEE_STATS = {
  last_ledger: '4372364',
  last_ledger_base_fee: '100',
  ledger_capacity_usage: '0.07',
  fee_charged: {
    max: '1000000',
    min: '100',
    mode: '100',
    p10: '100',
    p20: '100',
    p30: '100',
    p40: '100',
    p50: '100',
    p60: '100',
    p70: '100',
    p80: '100',
    p90: '95947',
    p95: '154834',
    p99: '706514',
  },
  max_fee: {
    max: '10158435',
    min: '100',
    mode: '1057160',
    p10: '22798',
    p20: '33932',
    p30: '100000',
    p40: '248050',
    p50: '271802',
    p60: '1000000',
    p70: '1057160',
    p80: '10017111',
    p90: '10026818',
    p95: '10057574',
    p99: '10158435',
  },
};

describe('fee routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    jest.useRealTimers();
  });

  describe('GET /api/v1/fees/estimate', () => {
    it('returns 200 with the correct data shape on success', async () => {
      const feeStats = jest.fn().mockResolvedValueOnce(MOCK_FEE_STATS);
      setMockServer({ feeStats });

      const response = await request(app).get('/api/v1/fees/estimate');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          baseFee: 100,
          lastLedger: '4372364',
          ledgerCapacityUsage: '0.07',
          feeCharged: {
            min: '100',
            mode: '100',
            p10: '100',
            p50: '100',
            p90: '95947',
            p95: '154834',
            p99: '706514',
          },
        },
      });
    });

    it('returns baseFee as a number, not a string', async () => {
      const feeStats = jest.fn().mockResolvedValueOnce(MOCK_FEE_STATS);
      setMockServer({ feeStats });

      const response = await request(app).get('/api/v1/fees/estimate');

      expect(response.status).toBe(200);
      expect(typeof response.body.data.baseFee).toBe('number');
    });

    it('returns 502 when Horizon returns an error response', async () => {
      const feeStats = jest.fn().mockRejectedValueOnce({
        response: {
          status: 500,
          data: { detail: 'Horizon unavailable' },
        },
      });
      setMockServer({ feeStats });

      const response = await request(app).get('/api/v1/fees/estimate');

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar network error: Horizon unavailable',
      });
    });

    it('returns 502 after retry exhaustion, calling feeStats exactly 4 times', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const feeStats = jest.fn().mockRejectedValue({
        response: { status: 503, data: { detail: 'Service unavailable' } },
      });
      setMockServer({ feeStats });

      const response = await request(app).get('/api/v1/fees/estimate');

      expect(response.status).toBe(502);
      expect(feeStats).toHaveBeenCalledTimes(4);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), expect.any(Number));
      expect(setTimeoutSpy.mock.calls[0][1]).toBeGreaterThanOrEqual(0);
      expect(setTimeoutSpy.mock.calls[0][1]).toBeLessThan(100);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), expect.any(Number));
      expect(setTimeoutSpy.mock.calls[1][1]).toBeGreaterThanOrEqual(0);
      expect(setTimeoutSpy.mock.calls[1][1]).toBeLessThan(200);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), expect.any(Number));
      expect(setTimeoutSpy.mock.calls[2][1]).toBeGreaterThanOrEqual(0);
      expect(setTimeoutSpy.mock.calls[2][1]).toBeLessThan(400);
    });
  });
});
