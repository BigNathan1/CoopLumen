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
import { redisCache } from '../../../cache/redis';
import { StellarService } from '../../../contracts/stellar';

const publicKey = Keypair.random().publicKey();

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

const MOCK_TRUSTLINE = {
  balance: '10.0000000',
  limit: '922337203685.4775807',
  buying_liabilities: '0.0000000',
  selling_liabilities: '0.0000000',
  last_modified_ledger: 2638989,
  is_authorized: true,
  is_authorized_to_maintain_liabilities: true,
  asset_type: 'credit_alphanum4',
  asset_code: 'USDC',
  asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

const MOCK_NATIVE = {
  asset_type: 'native',
  balance: '100.0000000',
  buying_liabilities: '0.0000000',
  selling_liabilities: '0.0000000',
};

describe('account routes', () => {
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

  describe('GET /api/v1/accounts/:publicKey/trustlines', () => {
    it('returns 400 with a validation error for an invalid public key', async () => {
      const response = await request(app).get('/api/v1/accounts/not-a-stellar-key/trustlines');

      expect(response.status).toBe(400);
      expect(response.body.data).toBeNull();
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.meta.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'publicKey' })])
      );
    });

    it('returns 200 with the trustlines array for an account with trustlines', async () => {
      const loadAccount = jest.fn().mockResolvedValueOnce({
        balances: [MOCK_NATIVE, MOCK_TRUSTLINE],
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(
        `/api/v1/accounts/${publicKey}/trustlines`
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [MOCK_TRUSTLINE] });
      expect(loadAccount).toHaveBeenCalledWith(publicKey);
    });

    it('returns 200 with an empty array for an account with no trustlines', async () => {
      const loadAccount = jest.fn().mockResolvedValueOnce({
        balances: [MOCK_NATIVE],
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(
        `/api/v1/accounts/${publicKey}/trustlines`
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [] });
    });

    it('returns 404 when Horizon reports the account does not exist', async () => {
      const loadAccount = jest.fn().mockRejectedValueOnce({
        response: { status: 404 },
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(
        `/api/v1/accounts/${publicKey}/trustlines`
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar account or asset not found.',
      });
    });

    it('returns 502 after retry exhaustion, calling loadAccount exactly 4 times', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const loadAccount = jest.fn().mockRejectedValue({
        response: { status: 503, data: { detail: 'Service unavailable' } },
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(
        `/api/v1/accounts/${publicKey}/trustlines`
      );

      expect(response.status).toBe(502);
      expect(loadAccount).toHaveBeenCalledTimes(4);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 400);
    });
  });
});
