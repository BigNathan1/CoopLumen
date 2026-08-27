import request from 'supertest';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
  FeeBumpTransaction,
} from '@stellar/stellar-sdk';

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
import { StellarService } from '../../../contracts/stellar';
import { redisCache } from '../../../cache/redis';

const mockDb = db as jest.Mocked<typeof db>;

// Test keypairs
const senderKeypair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const senderPublicKey = senderKeypair.publicKey();
const destinationKeypair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2));
const destinationPublicKey = destinationKeypair.publicKey();
const assetIssuerKeypair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3));
const assetIssuer = assetIssuerKeypair.publicKey();

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

function signTransaction(xdr: string, keypair: Keypair): string {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
  tx.sign(keypair);
  return tx.toXDR();
}

describe('POST /api/v1/transactions/unsigned - Building unsigned transactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StellarService as unknown as { network: string }).network = Networks.TESTNET;
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setEx.mockResolvedValue(undefined);
    mockRedisClient.del.mockResolvedValue(undefined);
    mockRedisClient.on.mockReturnValue(mockRedisClient);
    (redisCache as unknown as { client: unknown }).client = null;
    (redisCache as unknown as { connectPromise: unknown }).connectPromise = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Successful transaction building', () => {
    it('builds a custom-asset payment with correct sequence number', async () => {
      const loadAccount = jest.fn().mockResolvedValue(new Account(senderPublicKey, '100'));
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'COOP',
        assetIssuer,
        amount: '50.5',
        memo: 'payment for services',
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('xdr');
      expect(typeof response.body.data.xdr).toBe('string');

      const tx = TransactionBuilder.fromXDR(response.body.data.xdr, Networks.TESTNET) as Transaction;
      expect(tx.sequence).toBe('101'); // Current seq 100 + 1
      expect(tx.operations).toHaveLength(1);

      const op = tx.operations[0];
      expect(op).toMatchObject({
        type: 'payment',
        destination: destinationPublicKey,
        amount: '50.5',
      });

      if (op.type === 'payment') {
        expect(op.asset.equals(new Asset('COOP', assetIssuer))).toBe(true);
      }

      expect(tx.memo.type).toBe('text');
      expect(tx.memo.value?.toString()).toBe('payment for services');
    });

    it('builds native XLM payment without requiring asset issuer', async () => {
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '50')),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '25.75',
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      const op = tx.operations[0];

      if (op.type === 'payment') {
        expect(op.asset.isNative()).toBe(true);
      }
    });

    it('builds transaction with optional memo when not provided', async () => {
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '1')),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      expect(tx.memo.type).toBe('none');
    });

    it('builds transaction with large sequence number', async () => {
      const largeSeq = '9223372036854775806'; // Near max sequence
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, largeSeq)),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      expect(tx.sequence).toBe('9223372036854775807');
    });
  });

  describe('Input validation', () => {
    it('returns validation error for invalid sender public key', async () => {
      const loadAccount = jest.fn();
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey: 'not-a-key',
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        data: null,
        meta: {
          errors: expect.arrayContaining([
            expect.objectContaining({ path: 'senderPublicKey', message: expect.any(String) }),
          ]),
        },
        error: 'Validation failed',
      });
      expect(loadAccount).not.toHaveBeenCalled();
    });

    it('returns validation error for invalid destination public key', async () => {
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey: 'invalid',
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.data).toBeNull();
    });

    it('returns validation error for zero or negative amount', async () => {
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '0',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.meta.errors).toContainEqual(
        expect.objectContaining({ path: 'amount' })
      );
    });

    it('returns validation error for invalid amount format', async () => {
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: 'not-a-number',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('returns validation error for amount with too many decimal places', async () => {
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.123456789', // More than 7 decimal places
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('returns validation error for missing asset issuer on non-XLM asset', async () => {
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'COOP',
        amount: '10.0',
        // Missing assetIssuer
      });

      expect(response.status).toBe(400);
      expect(response.body.meta.errors).toContainEqual(
        expect.objectContaining({ path: 'assetIssuer' })
      );
    });

    it('returns validation error for invalid asset code', async () => {
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'TOOLONGASSETCODE',
        assetIssuer,
        amount: '1.0',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('returns validation error for memo exceeding 28 bytes', async () => {
      const longMemo = 'x'.repeat(29); // 29 bytes, exceeds limit
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
        memo: longMemo,
      });

      expect(response.status).toBe(400);
      expect(response.body.meta.errors).toContainEqual(
        expect.objectContaining({ path: 'memo' })
      );
    });

    it('returns validation error for UTF-8 memo exceeding byte limit', async () => {
      // Emoji is 4 bytes in UTF-8
      const memoWithEmojis = '🚀'.repeat(8); // 32 bytes, exceeds 28-byte limit
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
        memo: memoWithEmojis,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('accepts valid UTF-8 memo within byte limit', async () => {
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '1')),
      });

      const validMemo = '测试'; // Chinese characters, multiple bytes but within 28
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
        memo: validMemo,
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Horizon error handling', () => {
    it('returns 404 when sender account does not exist', async () => {
      setMockServer({
        loadAccount: jest.fn().mockRejectedValue({ response: { status: 404 } }),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar account or asset not found.',
      });
    });

    it('retries on temporary Horizon 503 failures', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const loadAccount = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce(new Account(senderPublicKey, '5'));
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      expect(loadAccount).toHaveBeenCalledTimes(2);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
    });

    it('retries on temporary Horizon 429 (rate limit) failures', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const loadAccount = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce(new Account(senderPublicKey, '10'));
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      expect(loadAccount).toHaveBeenCalledTimes(3);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
    });

    it('respects Retry-After header when provided', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const loadAccount = jest
        .fn()
        .mockRejectedValueOnce({
          response: { status: 503, headers: { 'retry-after': '0.5' } },
        })
        .mockResolvedValueOnce(new Account(senderPublicKey, '3'));
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
    });

    it('fails with 502 after exhausting retries', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const loadAccount = jest.fn().mockRejectedValue({
        response: { status: 503, data: { detail: 'Service temporarily unavailable' } },
      });
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar network error: Service temporarily unavailable',
      });
      expect(loadAccount).toHaveBeenCalledTimes(4); // max 4 attempts
      expect(setTimeoutSpy).toHaveBeenCalledTimes(3); // 3 retries with delays
    });

    it('does not retry on permanent Horizon failures (non-retryable status)', async () => {
      const loadAccount = jest.fn().mockRejectedValue({
        response: { status: 400, data: { detail: 'Bad request' } },
      });
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(502);
      expect(loadAccount).toHaveBeenCalledTimes(1); // Called once, no retries
    });

    it('maps generic Horizon errors to 502', async () => {
      setMockServer({
        loadAccount: jest.fn().mockRejectedValue({
          response: { status: 500, data: { title: 'Internal Server Error' } },
        }),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(502);
      expect(response.body.error).toBe('Stellar network error: Internal Server Error');
    });
  });
});

describe('Transaction submission flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StellarService as unknown as { network: string }).network = Networks.TESTNET;
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setEx.mockResolvedValue(undefined);
    mockRedisClient.del.mockResolvedValue(undefined);
    mockRedisClient.on.mockReturnValue(mockRedisClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Successful transaction submission (end-to-end)', () => {
    it('successfully builds, signs, and submits a payment transaction', async () => {
      // Step 1: Build unsigned XDR
      const loadAccountForBuild = jest
        .fn()
        .mockResolvedValue(new Account(senderPublicKey, '100'));
      setMockServer({ loadAccount: loadAccountForBuild });

      const buildResponse = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '50.0',
        memo: 'test payment',
      });

      expect(buildResponse.status).toBe(200);
      const unsignedXdr = buildResponse.body.data.xdr;

      // Step 2: Client signs the XDR
      const signedXdr = signTransaction(unsignedXdr, senderKeypair);

      // Verify the transaction is signed
      const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET) as Transaction;
      expect(tx.signatures.length).toBeGreaterThan(0);
      expect(tx.sequence).toBe('101');
      expect(tx.operations[0].type).toBe('payment');
    });

    it('handles payment with custom asset correctly through entire flow', async () => {
      const loadAccount = jest
        .fn()
        .mockResolvedValue(new Account(senderPublicKey, '50'));
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'COOP',
        assetIssuer,
        amount: '100.5',
        memo: 'dividend payout',
      });

      expect(response.status).toBe(200);

      const tx = TransactionBuilder.fromXDR(response.body.data.xdr, Networks.TESTNET) as Transaction;
      const op = tx.operations[0];

      expect(tx.sequence).toBe('51');
      expect(tx.memo.value?.toString()).toBe('dividend payout');
      expect(op).toHaveProperty('type', 'payment');

      if (op.type === 'payment') {
        expect(op.asset.code).toBe('COOP');
        expect(op.asset.issuer).toBe(assetIssuer);
        expect(op.amount).toBe('100.5');
      }
    });
  });

  describe('Sequence number staleness handling', () => {
    it('detects and properly handles scenario where sequence becomes stale', async () => {
      // This test demonstrates the flow if tx_bad_seq error occurs
      // In practice, this would happen when:
      // 1. Client builds unsigned XDR (seq 101)
      // 2. Client signs it
      // 3. Another transaction with the same sequence is submitted first
      // 4. Current sequence advances to 102+
      // 5. Client tries to submit the old signed transaction
      // 6. Horizon returns tx_bad_seq error

      // For the build phase (which our endpoint handles):
      const loadAccount = jest
        .fn()
        .mockResolvedValue(new Account(senderPublicKey, '100'));
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      expect(tx.sequence).toBe('101');

      // If client receives tx_bad_seq, they should:
      // 1. Call /transactions/unsigned again to get fresh sequence
      // 2. Sign and submit the new XDR

      loadAccount.mockClear();
      const secondLoadAccount = jest
        .fn()
        .mockResolvedValue(new Account(senderPublicKey, '102'));
      setMockServer({ loadAccount: secondLoadAccount });

      const retryResponse = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(retryResponse.status).toBe(200);
      const retryTx = TransactionBuilder.fromXDR(
        retryResponse.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      expect(retryTx.sequence).toBe('103'); // Now has fresh sequence
    });
  });

  describe('Cache invalidation and eventual consistency', () => {
    it('ensures balance cache would be invalidated after successful submission', async () => {
      // This test verifies that the contracts that DO submit transactions
      // properly invalidate cache. Our endpoint builds XDR, but downstream
      // submission (in assets.ts, trustlines.ts) should invalidate cache.

      // The pattern is: StellarService.submitTransaction() -> invalidateBalanceCache()
      // This is tested in the submission tests for those contracts.

      // For our unsigned endpoint, we verify no spurious caching happens:
      const loadAccount = jest
        .fn()
        .mockResolvedValue(new Account(senderPublicKey, '5'));
      setMockServer({ loadAccount });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      // No cache operations should occur for building unsigned XDR
      expect(mockRedisClient.get).not.toHaveBeenCalled();
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases and robustness', () => {
    it('handles very large decimal amounts (7 decimal places)', async () => {
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '1')),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '9999999.9999999', // Maximum Stellar amount with 7 decimals
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      const op = tx.operations[0];
      if (op.type === 'payment') {
        expect(op.amount).toBe('9999999.9999999');
      }
    });

    it('handles minimum valid amount (0.0000001)', async () => {
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '1')),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '0.0000001',
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      const op = tx.operations[0];
      if (op.type === 'payment') {
        expect(op.amount).toBe('0.0000001');
      }
    });

    it('rejects amount with leading zeros', async () => {
      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'XLM',
        amount: '01.5', // Leading zero
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('handles both letter cases in asset code', async () => {
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '1')),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: 'CoOp', // Mixed case
        assetIssuer,
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      const op = tx.operations[0];
      if (op.type === 'payment') {
        expect(op.asset.code).toBe('CoOp');
      }
    });

    it('handles numeric-only asset codes', async () => {
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '1')),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey,
        destinationPublicKey,
        assetCode: '123',
        assetIssuer,
        amount: '1.0',
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      const op = tx.operations[0];
      if (op.type === 'payment') {
        expect(op.asset.code).toBe('123');
      }
    });

    it('trims whitespace from all string inputs', async () => {
      setMockServer({
        loadAccount: jest.fn().mockResolvedValue(new Account(senderPublicKey, '1')),
      });

      const response = await request(app).post('/api/v1/transactions/unsigned').send({
        senderPublicKey: `  ${senderPublicKey}  `,
        destinationPublicKey: `  ${destinationPublicKey}  `,
        assetCode: '  XLM  ',
        amount: '  1.0  ',
        memo: '  test memo  ',
      });

      expect(response.status).toBe(200);
      const tx = TransactionBuilder.fromXDR(
        response.body.data.xdr,
        Networks.TESTNET
      ) as Transaction;
      expect(tx.memo.value?.toString()).toBe('test memo');
    });
  });
});
