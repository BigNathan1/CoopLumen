import request from 'supertest';
import { Account, Keypair } from '@stellar/stellar-sdk';

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
    query: jest.fn(),
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
import { redisCache } from '../../../cache/redis';
import { StellarService } from '../../../contracts/stellar';

const mockDb = db as jest.Mocked<typeof db>;

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

describe('POST /api/v1/tokens/airdrop', () => {
  const issuer = Keypair.random();
  const memberOne = Keypair.random().publicKey();
  const memberTwo = Keypair.random().publicKey();

  const createIssuerAccount = (nativeBalance = '50.0000000'): Account =>
    Object.assign(new Account(issuer.publicKey(), '1'), {
      balances: [{ asset_type: 'native', balance: nativeBalance }],
    });

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
    (StellarService as unknown as { network: string }).network = 'test-network';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('validates the request body', async () => {
    const response = await request(app).post('/api/v1/tokens/airdrop').send({});

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error).toBe('Invalid request body');
    expect(response.body.meta.errors).toBeDefined();
  });

  it('distributes the requested amount to every member and invalidates cached balances', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ asset_code: 'TDAO', asset_issuer: issuer.publicKey() }])
      .mockResolvedValueOnce([{ stellar_address: memberOne }, { stellar_address: memberTwo }]);

    const loadAccount = jest.fn().mockImplementation(() => createIssuerAccount());
    const submitTransaction = jest
      .fn()
      .mockResolvedValueOnce({ hash: 'hash-one' })
      .mockResolvedValueOnce({ hash: 'hash-two' });
    setMockServer({ loadAccount, submitTransaction });

    const response = await request(app).post('/api/v1/tokens/airdrop').send({
      communityId: '11111111-1111-4111-8111-111111111111',
      amount: '12.5',
      issuerSecret: issuer.secret(),
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      amount: '12.5',
      recipientCount: 2,
      txHashes: ['hash-one', 'hash-two'],
    });
    expect(submitTransaction).toHaveBeenCalledTimes(2);
    expect(mockRedisClient.del).toHaveBeenCalledWith(`balances:${issuer.publicKey()}`);
    expect(mockRedisClient.del).toHaveBeenCalledWith(`balances:${memberOne}`);
    expect(mockRedisClient.del).toHaveBeenCalledWith(`balances:${memberTwo}`);
  });

  it('maps tx_insufficient_balance to HTTP 402 with the required XLM amount', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ asset_code: 'TDAO', asset_issuer: issuer.publicKey() }])
      .mockResolvedValueOnce([{ stellar_address: memberOne }]);

    const loadAccount = jest.fn().mockResolvedValueOnce(createIssuerAccount('0.0000010'));
    const submitTransaction = jest.fn().mockRejectedValueOnce({
      response: { data: { extras: { result_codes: { transaction: 'tx_insufficient_balance' } } } },
    });
    setMockServer({ loadAccount, submitTransaction });

    const response = await request(app).post('/api/v1/tokens/airdrop').send({
      communityId: '11111111-1111-4111-8111-111111111111',
      amount: '12.5',
      issuerSecret: issuer.secret(),
    });

    expect(response.status).toBe(402);
    expect(response.body).toEqual({
      data: null,
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: 'Account balance is insufficient to cover the transaction and fees.',
        requiredXlm: '0.0000100',
        currentBalance: '0.0000010',
      },
    });
  });

  it('retries retryable Horizon failures and eventually succeeds', async () => {
    const setTimeoutSpy = runTimeoutsImmediately();
    mockDb.query
      .mockResolvedValueOnce([{ asset_code: 'TDAO', asset_issuer: issuer.publicKey() }])
      .mockResolvedValueOnce([{ stellar_address: memberOne }]);

    const loadAccount = jest.fn().mockImplementation(() => createIssuerAccount());
    const submitTransaction = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ hash: 'hash-one' });
    setMockServer({ loadAccount, submitTransaction });

    const response = await request(app).post('/api/v1/tokens/airdrop').send({
      communityId: '11111111-1111-4111-8111-111111111111',
      amount: '12.5',
      issuerSecret: issuer.secret(),
    });

    expect(response.status).toBe(200);
    expect(response.body.data.txHashes).toEqual(['hash-one']);
    expect(submitTransaction).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
  });

  it('returns a 502 when retryable Horizon failures are exhausted', async () => {
    const setTimeoutSpy = runTimeoutsImmediately();
    mockDb.query
      .mockResolvedValueOnce([{ asset_code: 'TDAO', asset_issuer: issuer.publicKey() }])
      .mockResolvedValueOnce([{ stellar_address: memberOne }]);

    const loadAccount = jest.fn().mockImplementation(() => createIssuerAccount());
    const submitTransaction = jest
      .fn()
      .mockRejectedValue({ response: { status: 429, data: { detail: 'Back off' } } });
    setMockServer({ loadAccount, submitTransaction });

    const response = await request(app).post('/api/v1/tokens/airdrop').send({
      communityId: '11111111-1111-4111-8111-111111111111',
      amount: '12.5',
      issuerSecret: issuer.secret(),
    });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      data: null,
      error: 'Stellar network error: Back off',
    });
    expect(submitTransaction).toHaveBeenCalledTimes(4);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 400);
  });

  it('maps unexpected Horizon failures to a stable user-facing error', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ asset_code: 'TDAO', asset_issuer: issuer.publicKey() }])
      .mockResolvedValueOnce([{ stellar_address: memberOne }]);

    const loadAccount = jest.fn().mockImplementation(() => createIssuerAccount());
    const submitTransaction = jest.fn().mockRejectedValueOnce({
      response: { data: { extras: { result_codes: { operations: ['op_no_trust'] } } } },
    });
    setMockServer({ loadAccount, submitTransaction });

    const response = await request(app).post('/api/v1/tokens/airdrop').send({
      communityId: '11111111-1111-4111-8111-111111111111',
      amount: '12.5',
      issuerSecret: issuer.secret(),
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      data: null,
      error: 'Destination account does not have a trustline for this asset.',
    });
  });
});
