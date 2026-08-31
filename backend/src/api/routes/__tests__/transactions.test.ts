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

function runTimeoutsImmediately(): jest.SpyInstance {
  return jest.spyOn(global, 'setTimeout').mockImplementation(((
    callback: (...args: unknown[]) => void
  ) => {
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
}

describe('POST /api/v1/transactions/unsigned', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StellarService as unknown as { network: string }).network = Networks.TESTNET;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds an unsigned custom-asset payment XDR from the Horizon sequence number', async () => {
    const loadAccount = jest.fn().mockResolvedValue(new Account(senderPublicKey, '123'));
    setMockServer({ loadAccount });

    const response = await request(app).post('/api/v1/transactions/unsigned').send({
      senderPublicKey,
      destinationPublicKey,
      assetCode: 'COOP',
      assetIssuer,
      amount: '12.3456789',
      memo: 'member payout',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { xdr: expect.any(String) } });
    expect(loadAccount).toHaveBeenCalledWith(senderPublicKey);

    const transaction = TransactionBuilder.fromXDR(
      response.body.data.xdr,
      Networks.TESTNET
    ) as Transaction;
    const operation = transaction.operations[0];

    expect(transaction.sequence).toBe('124');
    expect(transaction.signatures).toHaveLength(0);
    expect(transaction.operations).toHaveLength(1);
    expect(operation).toMatchObject({
      type: 'payment',
      destination: destinationPublicKey,
      amount: '12.3456789',
    });
    expect(
      operation.type === 'payment' && operation.asset.equals(new Asset('COOP', assetIssuer))
    ).toBe(true);
    expect(transaction.memo.type).toBe('text');
    expect(transaction.memo.value?.toString()).toBe('member payout');
  });

  it('builds a native XLM payment without requiring an asset issuer', async () => {
    setMockServer({
      loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '8')),
    });

    const response = await request(app).post('/api/v1/transactions/unsigned').send({
      senderPublicKey,
      destinationPublicKey,
      assetCode: 'XLM',
      amount: '1.5',
    });

    expect(response.status).toBe(200);
    const transaction = TransactionBuilder.fromXDR(
      response.body.data.xdr,
      Networks.TESTNET
    ) as Transaction;
    const operation = transaction.operations[0];
    expect(operation.type === 'payment' && operation.asset.isNative()).toBe(true);
  });

  it('returns envelope-formatted Zod validation errors without calling Horizon', async () => {
    const loadAccount = jest.fn();
    setMockServer({ loadAccount });

    const response = await request(app)
      .post('/api/v1/transactions/unsigned')
      .send({
        senderPublicKey: 'invalid',
        destinationPublicKey,
        assetCode: 'COOP',
        amount: '0',
        memo: '\u{1F680}'.repeat(8),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      data: null,
      meta: {
        errors: expect.arrayContaining([
          expect.objectContaining({ path: 'senderPublicKey' }),
          expect.objectContaining({ path: 'assetIssuer' }),
          expect.objectContaining({ path: 'amount' }),
          expect.objectContaining({ path: 'memo' }),
        ]),
      },
      error: 'Validation failed',
    });
    expect(loadAccount).not.toHaveBeenCalled();
  });

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

    const response = await request(app).post('/api/v1/transactions/unsigned').send({
      senderPublicKey,
      destinationPublicKey,
      assetCode: 'XLM',
      amount: '1',
    });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      data: null,
      error: 'Stellar network error: upstream request failed',
    });
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
