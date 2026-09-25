import request from 'supertest';
import app from '../../../app';
import { db } from '../../../db';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const validUUID = '550e8400-e29b-41d4-a716-446655440000';
const validRequestID = '660e8400-e29b-41d4-a716-446655440000';
const validStellarAddress = 'GDB7QUZ7Z4C6C7DYXU4EB3OG4GLH5HSZX75QW2IQ3YSNKMGHWEJ5FCF6';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('MultiSig Endpoint Handlers (Issue #417 / #495)', () => {
  describe('GET /api/v1/multisig/community/:communityId', () => {
    it('returns 400 when :communityId is not a valid UUID', async () => {
      const res = await request(app).get('/api/v1/multisig/community/invalid-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 404 when community does not exist', async () => {
      mockDb.query.mockResolvedValueOnce([]);
      const res = await request(app).get(`/api/v1/multisig/community/${validUUID}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Community not found');
    });

    it('returns 200 with list of requests for a valid community', async () => {
      const mockRequests = [
        {
          id: validRequestID,
          community_id: validUUID,
          proposer_address: validStellarAddress,
          action: 'payment',
          title: 'Disburse Community Funds',
          description: 'Batch payout to members',
          payload: { recipients: [] },
          transaction_xdr: 'AAAA...',
          required_signatures: 2,
          current_signatures: 1,
          status: 'pending',
          stellar_tx_hash: null,
          rejection_reason: null,
          expires_at: null,
          executed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockDb.query
        .mockResolvedValueOnce([{ id: validUUID }]) // community check
        .mockResolvedValueOnce([{ total: '1' }]) // count query
        .mockResolvedValueOnce(mockRequests); // data query

      const res = await request(app).get(`/api/v1/multisig/community/${validUUID}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockRequests);
      expect(res.body.meta).toEqual(
        expect.objectContaining({ total: 1, page: 1, limit: 20 })
      );
    });
  });

  describe('POST /api/v1/multisig/community/:communityId', () => {
    it('returns 400 when body validation fails', async () => {
      const res = await request(app)
        .post(`/api/v1/multisig/community/${validUUID}`)
        .send({ title: '' }); // missing required action and proposer_address
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 404 when community does not exist', async () => {
      mockDb.query.mockResolvedValueOnce([]);
      const res = await request(app)
        .post(`/api/v1/multisig/community/${validUUID}`)
        .send({
          action: 'payment',
          title: 'Batch Disburse',
          proposer_address: validStellarAddress,
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Community not found');
    });

    it('creates and returns 201 with new multisig request', async () => {
      const newRequest = {
        id: validRequestID,
        community_id: validUUID,
        proposer_address: validStellarAddress,
        action: 'payment',
        title: 'Batch Disburse',
        description: null,
        payload: {},
        transaction_xdr: null,
        required_signatures: 2,
        current_signatures: 0,
        status: 'pending',
        stellar_tx_hash: null,
        rejection_reason: null,
        expires_at: null,
        executed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDb.query
        .mockResolvedValueOnce([{ id: validUUID }]) // community check
        .mockResolvedValueOnce([newRequest]); // insert

      const res = await request(app)
        .post(`/api/v1/multisig/community/${validUUID}`)
        .send({
          action: 'payment',
          title: 'Batch Disburse',
          proposer_address: validStellarAddress,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual(newRequest);
    });
  });

  describe('GET /api/v1/multisig/requests/:id', () => {
    it('returns 404 when request is not found', async () => {
      mockDb.query.mockResolvedValueOnce([]);
      const res = await request(app).get(`/api/v1/multisig/requests/${validRequestID}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('MultiSig request not found');
    });

    it('returns 200 with request details', async () => {
      const mockRequest = {
        id: validRequestID,
        title: 'MultiSig Proposal',
        status: 'pending',
      };
      mockDb.query.mockResolvedValueOnce([mockRequest]);

      const res = await request(app).get(`/api/v1/multisig/requests/${validRequestID}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockRequest);
    });
  });

  describe('POST /api/v1/multisig/requests/:id/approve', () => {
    it('returns 404 when request does not exist', async () => {
      mockDb.query.mockResolvedValueOnce([]);
      const res = await request(app).post(`/api/v1/multisig/requests/${validRequestID}/approve`).send({});
      expect(res.status).toBe(404);
    });

    it('returns 400 when request is not pending', async () => {
      mockDb.query.mockResolvedValueOnce([{ id: validRequestID, status: 'executed', current_signatures: 2, required_signatures: 2 }]);
      const res = await request(app).post(`/api/v1/multisig/requests/${validRequestID}/approve`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Cannot approve request with status 'executed'");
    });

    it('approves request and increments signature count', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ id: validRequestID, status: 'pending', current_signatures: 1, required_signatures: 2, transaction_xdr: 'XDR1' }])
        .mockResolvedValueOnce([{ id: validRequestID, status: 'approved', current_signatures: 2, required_signatures: 2, transaction_xdr: 'XDR_SIGNED' }]);

      const res = await request(app)
        .post(`/api/v1/multisig/requests/${validRequestID}/approve`)
        .send({ signed_xdr: 'XDR_SIGNED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('approved');
      expect(res.body.data.current_signatures).toBe(2);
    });
  });

  describe('POST /api/v1/multisig/requests/:id/reject', () => {
    it('rejects pending request and records reason', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ id: validRequestID, status: 'pending' }])
        .mockResolvedValueOnce([{ id: validRequestID, status: 'rejected', rejection_reason: 'Invalid payload' }]);

      const res = await request(app)
        .post(`/api/v1/multisig/requests/${validRequestID}/reject`)
        .send({ reason: 'Invalid payload' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.rejection_reason).toBe('Invalid payload');
    });
  });

  describe('POST /api/v1/multisig/requests/:id/execute', () => {
    it('executes approved request with tx hash', async () => {
      const mockTxHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      mockDb.query
        .mockResolvedValueOnce([{ id: validRequestID, status: 'approved' }])
        .mockResolvedValueOnce([{ id: validRequestID, status: 'executed', stellar_tx_hash: mockTxHash }]);

      const res = await request(app)
        .post(`/api/v1/multisig/requests/${validRequestID}/execute`)
        .send({ stellar_tx_hash: mockTxHash });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('executed');
      expect(res.body.data.stellar_tx_hash).toBe(mockTxHash);
    });
  });
});
