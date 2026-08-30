import request from 'supertest';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

jest.mock('../../../db', () => ({
  db: { ping: jest.fn().mockResolvedValue(true) },
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

const senderPublicKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const destinationPublicKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const assetIssuer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();

function setMockServer(server: unknown): void {
  (StellarService as unknown as { server: unknown }).server = server;
}

describe('GET /api/v1/transactions/:hash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StellarService as unknown as { network: string }).network = Networks.TESTNET;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches transaction details by valid hash from Horizon', async () => {
    const mockTxRecord = {
      id: 'abc123hash',
      hash: 'a'.repeat(64),
      ledger: 12345,
      created_at: '2026-01-01T00:00:00Z',
      source_account: senderPublicKey,
      fee_charged: '100',
      successful: true,
      operation_count: 1,
    };

    const getTransaction = jest.fn().mockReturnValue({
      call: jest.fn().mockResolvedValue(mockTxRecord),
    });
    const transactions = jest.fn().mockReturnValue({ transaction: getTransaction });
    setMockServer({ transactions });

    const validHash = 'a'.repeat(64);
    const response = await request(app).get(`/api/v1/transactions/${validHash}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: mockTxRecord });
    expect(transactions).toHaveBeenCalled();
    expect(getTransaction).toHaveBeenCalledWith(validHash);
  });

  it('returns 400 validation error for an invalid transaction hash format', async () => {
    const response = await request(app).get('/api/v1/transactions/short-hash');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'Validation failed',
        meta: expect.any(Object),
      })
    );
  });

  it('returns 404 when transaction is not found on Horizon', async () => {
    const getTransaction = jest.fn().mockReturnValue({
      call: jest.fn().mockRejectedValue({
        response: { status: 404, data: { title: 'Resource Missing' } },
  it('maps a missing source account from Horizon to an actionable response', async () => {
    setMockServer({
      loadAccount: jest.fn().mockRejectedValue({ response: { status: 404 } }),
    });

    const response = await request(app).post('/api/v1/transactions/unsigned').send({
      senderPublicKey,
      destinationPublicKey,
      assetCode: 'XLM',
      amount: '1',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      data: null,
      error: 'Stellar account or asset not found.',
    });
  });

  it('retries temporary Horizon failures before building with the current sequence', async () => {
    const setTimeoutSpy = runTimeoutsImmediately();
    const loadAccount = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce(new Account(senderPublicKey, '20'));
    setMockServer({ loadAccount });

    const response = await request(app).post('/api/v1/transactions/unsigned').send({
      senderPublicKey,
      destinationPublicKey,
      assetCode: 'XLM',
      amount: '1',
    });

    expect(response.status).toBe(200);
    expect(loadAccount).toHaveBeenCalledTimes(3);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), expect.any(Number));
    expect(setTimeoutSpy.mock.calls[0][1]).toBeGreaterThanOrEqual(0);
    expect(setTimeoutSpy.mock.calls[0][1]).toBeLessThan(100);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), expect.any(Number));
    expect(setTimeoutSpy.mock.calls[1][1]).toBeGreaterThanOrEqual(0);
    expect(setTimeoutSpy.mock.calls[1][1]).toBeLessThan(200);
  });

  it('maps Horizon service failures without surfacing raw response objects', async () => {
    setMockServer({
      loadAccount: jest.fn().mockRejectedValue({
        response: { status: 500, data: { detail: 'upstream request failed' } },
      }),
    });
    const transactions = jest.fn().mockReturnValue({ transaction: getTransaction });
    setMockServer({ transactions });

    const validHash = 'b'.repeat(64);
    const response = await request(app).get(`/api/v1/transactions/${validHash}`);

    expect(response.status).toBe(404);
    expect(response.body.data).toBeNull();
  });
});

describe('GET /api/v1/transactions/:hash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StellarService as unknown as { network: string }).network = Networks.TESTNET;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches transaction details by valid hash from Horizon', async () => {
    const mockTxRecord = {
      id: 'abc123hash',
      hash: 'a'.repeat(64),
      ledger: 12345,
      created_at: '2026-01-01T00:00:00Z',
      source_account: senderPublicKey,
      fee_charged: '100',
      successful: true,
      operation_count: 1,
    };

    const getTransaction = jest.fn().mockReturnValue({
      call: jest.fn().mockResolvedValue(mockTxRecord),
    });
    const transactions = jest.fn().mockReturnValue({ transaction: getTransaction });
    setMockServer({ transactions });

    const validHash = 'a'.repeat(64);
    const response = await request(app).get(`/api/v1/transactions/${validHash}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: mockTxRecord });
    expect(transactions).toHaveBeenCalled();
    expect(getTransaction).toHaveBeenCalledWith(validHash);
  });

  it('returns 400 validation error for an invalid transaction hash format', async () => {
    const response = await request(app).get('/api/v1/transactions/short-hash');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'Validation failed',
        meta: expect.any(Object),
      })
    );
  });

  it('returns 404 when no transaction exists for the given hash', async () => {
    const getTransaction = jest.fn().mockReturnValue({
      call: jest.fn().mockRejectedValue({ response: { status: 404 } }),
    });
    const transactions = jest.fn().mockReturnValue({ transaction: getTransaction });
    setMockServer({ transactions });

    const validHash = 'b'.repeat(64);
    const response = await request(app).get(`/api/v1/transactions/${validHash}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      data: null,
      error: 'Stellar account or asset not found.',
    });
  });
});
