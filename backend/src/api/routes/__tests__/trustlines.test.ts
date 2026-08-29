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

const accountPublicKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const assetIssuer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

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

describe('POST /api/v1/trustlines/build', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StellarService as unknown as { network: string }).network = Networks.TESTNET;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds an unsigned trustline establishment XDR from the Horizon sequence number', async () => {
    const loadAccount = jest.fn().mockResolvedValue(new Account(accountPublicKey, '200'));
    setMockServer({ loadAccount });

    const response = await request(app).post('/api/v1/trustlines/build').send({
      accountPublicKey,
      assetCode: 'COOP',
      assetIssuer,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { xdr: expect.any(String) } });
    expect(loadAccount).toHaveBeenCalledWith(accountPublicKey);

    const transaction = TransactionBuilder.fromXDR(
      response.body.data.xdr,
      Networks.TESTNET
    ) as Transaction;
    expect(transaction.sequence).toBe('201');
    expect(transaction.signatures).toHaveLength(0);
    expect(transaction.operations).toHaveLength(1);

    const operation = transaction.operations[0];
    expect(operation.type).toBe('changeTrust');
    if (operation.type === 'changeTrust' && operation.line instanceof Asset) {
      expect(operation.line.equals(new Asset('COOP', assetIssuer))).toBe(true);
      expect(operation.limit).toBe('922337203685.4775807');
    }
  });

  it('builds an unsigned trustline establishment XDR with a custom limit', async () => {
    const loadAccount = jest.fn().mockResolvedValue(new Account(accountPublicKey, '5'));
    setMockServer({ loadAccount });

    const response = await request(app).post('/api/v1/trustlines/build').send({
      accountPublicKey,
      assetCode: 'COOP',
      assetIssuer,
      limit: '500.25',
    });

    expect(response.status).toBe(200);
    const transaction = TransactionBuilder.fromXDR(
      response.body.data.xdr,
      Networks.TESTNET
    ) as Transaction;
    const operation = transaction.operations[0];
    expect(operation.type).toBe('changeTrust');
    if (operation.type === 'changeTrust') {
      expect(operation.limit).toBe('500.2500000');
    }
  });

  it('returns envelope-formatted Zod validation errors without calling Horizon', async () => {
    const loadAccount = jest.fn();
    setMockServer({ loadAccount });

    const response = await request(app).post('/api/v1/trustlines/build').send({
      accountPublicKey: 'invalid-key',
      assetCode: '',
      assetIssuer: 'also-invalid',
      limit: '-10',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      data: null,
      meta: {
        errors: expect.arrayContaining([
          expect.objectContaining({ path: 'accountPublicKey' }),
          expect.objectContaining({ path: 'assetCode' }),
          expect.objectContaining({ path: 'assetIssuer' }),
          expect.objectContaining({ path: 'limit' }),
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

    const response = await request(app).post('/api/v1/trustlines/build').send({
      accountPublicKey,
      assetCode: 'COOP',
      assetIssuer,
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
      .mockResolvedValueOnce(new Account(accountPublicKey, '42'));
    setMockServer({ loadAccount });

    const response = await request(app).post('/api/v1/trustlines/build').send({
      accountPublicKey,
      assetCode: 'COOP',
      assetIssuer,
    });

    expect(response.status).toBe(200);
    expect(loadAccount).toHaveBeenCalledTimes(3);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
  });

  it('maps Horizon service failures without surfacing raw response objects', async () => {
    setMockServer({
      loadAccount: jest.fn().mockRejectedValue({
        response: { status: 500, data: { detail: 'upstream request failed' } },
      }),
    });

    const response = await request(app).post('/api/v1/trustlines/build').send({
      accountPublicKey,
      assetCode: 'COOP',
      assetIssuer,
    });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      data: null,
      error: 'Stellar network error: upstream request failed',
    });
  });
});
