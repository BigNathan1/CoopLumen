import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { buildBatchPayment, submitBatchPayment } from '../../../contracts/batchPayments';

jest.mock('../../../db', () => ({
  db: { query: jest.fn(), ping: jest.fn() },
}));

jest.mock('../../../contracts/batchPayments', () => ({
  buildBatchPayment: jest.fn(),
  submitBatchPayment: jest.fn(),
}));

const SENDER_KEYPAIR = Keypair.random();
const SENDER_SECRET = SENDER_KEYPAIR.secret();
const SENDER_PUBLIC = SENDER_KEYPAIR.publicKey();

const DEST1 = Keypair.random().publicKey();
const DEST2 = Keypair.random().publicKey();

describe('Batch Payments Endpoints (/api/v1/batch)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/batch/disburse', () => {
    it('submits a valid batch disbursement', async () => {
      (submitBatchPayment as jest.Mock).mockResolvedValueOnce('tx-hash-123456');

      const res = await request(app)
        .post('/api/v1/batch/disburse')
        .send({
          senderSecret: SENDER_SECRET,
          payments: [
            { destinationPublicKey: DEST1, amount: '10.5', assetCode: 'XLM' },
            { destinationPublicKey: DEST2, amount: '20.0', assetCode: 'XLM' },
          ],
          memo: 'Community Payout',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        hash: 'tx-hash-123456',
        paymentsCount: 2,
        totalAmount: '30.5',
        memo: 'Community Payout',
      });
      expect(submitBatchPayment).toHaveBeenCalledWith({
        senderSecret: SENDER_SECRET,
        payments: [
          { destinationPublicKey: DEST1, amount: '10.5', assetCode: 'XLM', assetIssuer: '' },
          { destinationPublicKey: DEST2, amount: '20.0', assetCode: 'XLM', assetIssuer: '' },
        ],
        memo: 'Community Payout',
      });
    });

    it('returns 400 for validation errors', async () => {
      const res = await request(app).post('/api/v1/batch/disburse').send({
        senderSecret: 'invalid-secret',
        payments: [],
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.meta.errors).toBeDefined();
    });
  });

  describe('POST /api/v1/batch/preview', () => {
    it('previews batch payments with fee and total calculation', async () => {
      (buildBatchPayment as jest.Mock).mockResolvedValueOnce('unsigned-xdr-preview');

      const res = await request(app)
        .post('/api/v1/batch/preview')
        .send({
          senderPublicKey: SENDER_PUBLIC,
          payments: [
            { destinationPublicKey: DEST1, amount: '15.0', assetCode: 'XLM' },
            { destinationPublicKey: DEST2, amount: '25.0', assetCode: 'XLM' },
          ],
          memo: 'Batch Test',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.recipientCount).toBe(2);
      expect(res.body.data.estimatedFeeStroops).toBe(200);
      expect(res.body.data.totalAmounts).toEqual({ XLM: '40' });
      expect(res.body.data.xdr).toBe('unsigned-xdr-preview');
    });

    it('returns 400 when non-XLM asset is missing assetIssuer', async () => {
      const res = await request(app)
        .post('/api/v1/batch/preview')
        .send({
          senderPublicKey: SENDER_PUBLIC,
          payments: [{ destinationPublicKey: DEST1, amount: '10', assetCode: 'USD' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/v1/batch/parse-csv', () => {
    it('parses valid CSV lines into batch payment entries', async () => {
      const csv = `address,amount\n${DEST1},10.5\n${DEST2},20.0`;

      const res = await request(app).post('/api/v1/batch/parse-csv').send({ csv });

      expect(res.status).toBe(200);
      expect(res.body.data.validCount).toBe(2);
      expect(res.body.data.entries).toEqual([
        { destinationPublicKey: DEST1, amount: '10.5', assetCode: 'XLM', assetIssuer: undefined },
        { destinationPublicKey: DEST2, amount: '20.0', assetCode: 'XLM', assetIssuer: undefined },
      ]);
    });

    it('returns line-specific error when CSV has invalid address or amount', async () => {
      const csv = `address,amount\n${DEST1},10.5\nINVALID_ADDRESS,5.0`;

      const res = await request(app).post('/api/v1/batch/parse-csv').send({ csv });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('CSV validation failed');
      expect(res.body.meta.errors[0].message).toContain('Line 3');
    });
  });
});
