import request from 'supertest';
import { TransactionBuilder } from '@stellar/stellar-sdk';

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

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@stellar/stellar-sdk', () => ({
  ...jest.requireActual('@stellar/stellar-sdk'),
  TransactionBuilder: {
    ...jest.requireActual('@stellar/stellar-sdk').TransactionBuilder,
    fromXDR: jest.fn(),
  },
}));

import app from '../../../app';
import { redisCache } from '../../../cache/redis';
import { StellarService } from '../../../contracts/stellar';

const mockFromXDR = TransactionBuilder.fromXDR as jest.Mock;
const sourcePublicKey = 'G' + 'A'.repeat(55);
const destinationPublicKey = 'G' + 'B'.repeat(55);

function setMockServer(server: unknown): void {
  (StellarService as unknown as { server: unknown }).server = server;
}

function runTimeoutsImmediately(): jest.SpyInstance {
  return jest
    .spyOn(global, 'setTimeout')
    .mockImplementation(((callback: (...args: unknown[]) => void) => {
      if (typeof callback === 'function') {
        callback();
      }

      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
}

describe('POST /api/v1/tokens/transfer', () => {
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

  it('rejects an empty body', async () => {
    const response = await request(app).post('/api/v1/tokens/transfer').send({});

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.meta.errors).toBeDefined();
    expect(mockFromXDR).not.toHaveBeenCalled();
  });

  it('rejects an XDR that fails to parse', async () => {
    mockFromXDR.mockImplementationOnce(() => {
      throw new Error('invalid XDR');
    });

    const response = await request(app)
      .post('/api/v1/tokens/transfer')
      .send({ signedXdr: 'not-valid-xdr' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/not a valid transaction/);
  });

  it('rejects a transaction that is not a single payment operation', async () => {
    mockFromXDR.mockReturnValueOnce({ operations: [{ type: 'createAccount' }] });

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/exactly one payment operation/);
  });

  it('submits a valid signed payment transaction and invalidates cached balances', async () => {
    const transaction = {
      fee: 100,
      source: sourcePublicKey,
      operations: [
        {
          type: 'payment',
          destination: destinationPublicKey,
          asset: { isNative: (): boolean => true },
          amount: '2.5000000',
        },
      ],
    };
    mockFromXDR.mockReturnValueOnce(transaction);

    const submitTransaction = jest.fn().mockResolvedValueOnce({ hash: 'tx-hash-1' });
    setMockServer({ submitTransaction });

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { txHash: 'tx-hash-1' } });
    expect(mockRedisClient.del).toHaveBeenCalledWith(`balances:${sourcePublicKey}`);
    expect(mockRedisClient.del).toHaveBeenCalledWith(`balances:${destinationPublicKey}`);
  });

  it('maps tx_insufficient_balance to HTTP 402 with requiredXlm and currentBalance', async () => {
    const transaction = {
      fee: 100,
      source: sourcePublicKey,
      operations: [
        {
          type: 'payment',
          destination: destinationPublicKey,
          asset: { isNative: (): boolean => true },
          amount: '10.0000000',
        },
      ],
    };
    mockFromXDR.mockReturnValueOnce(transaction);

    const submitTransaction = jest.fn().mockRejectedValueOnce({
      response: { data: { extras: { result_codes: { transaction: 'tx_insufficient_balance' } } } },
    });
    const loadAccount = jest.fn().mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '2.5000000' }],
    });
    setMockServer({ submitTransaction, loadAccount });

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(402);
    expect(response.body).toEqual({
      data: null,
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: 'Account balance is insufficient to cover the transaction and fees.',
        requiredXlm: '10.0000100',
        currentBalance: '2.5000000',
      },
    });
  });

  it('retries retryable Horizon failures and eventually succeeds', async () => {
    const setTimeoutSpy = runTimeoutsImmediately();
    const transaction = {
      fee: 100,
      source: sourcePublicKey,
      operations: [
        {
          type: 'payment',
          destination: destinationPublicKey,
          asset: { isNative: (): boolean => false },
          amount: '5.0000000',
        },
      ],
    };
    mockFromXDR.mockReturnValueOnce(transaction);

    const submitTransaction = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ hash: 'tx-hash-2' });
    setMockServer({ submitTransaction });

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { txHash: 'tx-hash-2' } });
    expect(submitTransaction).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
  });

  it('returns a 502 when retryable Horizon failures are exhausted', async () => {
    const setTimeoutSpy = runTimeoutsImmediately();
    const transaction = {
      fee: 100,
      source: sourcePublicKey,
      operations: [
        {
          type: 'payment',
          destination: destinationPublicKey,
          asset: { isNative: (): boolean => false },
          amount: '5.0000000',
        },
      ],
    };
    mockFromXDR.mockReturnValueOnce(transaction);

    const submitTransaction = jest
      .fn()
      .mockRejectedValue({ response: { status: 429, data: { detail: 'Slow down' } } });
    const loadAccount = jest.fn().mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '1.0000000' }],
    });
    setMockServer({ submitTransaction, loadAccount });

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      data: null,
      error: 'Stellar network error: Slow down',
    });
    expect(submitTransaction).toHaveBeenCalledTimes(4);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 400);
  });

  it('maps unexpected Horizon failures to a user-facing error', async () => {
    const transaction = {
      fee: 100,
      source: sourcePublicKey,
      operations: [
        {
          type: 'payment',
          destination: destinationPublicKey,
          asset: { isNative: (): boolean => false },
          amount: '5.0000000',
        },
      ],
    };
    mockFromXDR.mockReturnValueOnce(transaction);

    const submitTransaction = jest.fn().mockRejectedValueOnce({
      response: { data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } },
    });
    const loadAccount = jest.fn().mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '1.0000000' }],
    });
    setMockServer({ submitTransaction, loadAccount });

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      data: null,
      error: 'Transaction sequence number is stale; please retry.',
    });
  });
});
