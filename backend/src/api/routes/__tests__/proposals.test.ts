import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { db } from '../../../db';
import { createSessionToken } from '../../utils/sessionToken';

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

const query = db.query as jest.Mock;
const proposalId = '11111111-1111-4111-8111-111111111111';
const communityId = '22222222-2222-4222-8222-222222222222';
const proposer = Keypair.random().publicKey();

function authHeader(): string {
  return `Bearer ${createSessionToken(proposer).token}`;
}

const proposal = {
  id: proposalId,
  community_id: communityId,
  proposer_address: proposer,
  title: 'Fund the community garden',
  description: 'Release the approved grant.',
  type: 'treasury_spend',
  status: 'active',
  quorum_percent: '50.00',
  metadata: { amount: '500' },
  voting_starts_at: '2026-10-16T00:00:00.000Z',
  voting_ends_at: '2099-01-01T00:00:00.000Z',
  executed_at: null,
  stellar_tx_hash: null,
  created_at: '2026-10-16T00:00:00.000Z',
  updated_at: '2026-10-16T00:00:00.000Z',
};

describe('governance proposal routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/proposals', () => {
    it('requires a valid communityId query parameter', async () => {
      const response = await request(app).get('/api/v1/proposals?communityId=bad');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.meta.errors[0].path).toBe('communityId');
      expect(query).not.toHaveBeenCalled();
    });

    it('lists proposals for a community with an optional status filter', async () => {
      query.mockResolvedValue([proposal]);

      const response = await request(app).get(
        `/api/v1/proposals?communityId=${communityId}&status=active`
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [proposal] });
      expect(query).toHaveBeenCalledWith(expect.stringContaining('p.community_id = $1'), [
        communityId,
        'active',
      ]);
    });
  });

  describe('GET /api/v1/proposals/:id', () => {
    it('rejects a malformed proposal id before querying', async () => {
      const response = await request(app).get('/api/v1/proposals/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(query).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown proposal', async () => {
      query.mockResolvedValue([]);

      const response = await request(app).get(`/api/v1/proposals/${proposalId}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ data: null, error: 'Proposal not found' });
    });

    it('returns proposal detail with its current database tally', async () => {
      query.mockResolvedValue([{ ...proposal, votes_for: '75', votes_against: '25' }]);

      const response = await request(app).get(`/api/v1/proposals/${proposalId}`);

      expect(response.status).toBe(200);
      expect(response.body.data.votes_for).toBe('75');
      expect(response.body.data.votes_against).toBe('25');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN votes'), [proposalId]);
    });
  });

  describe('POST /api/v1/proposals', () => {
    const payload = {
      communityId,
      title: proposal.title,
      description: proposal.description,
      type: proposal.type,
      quorumPercent: 50,
      metadata: proposal.metadata,
      votingEndsAt: proposal.voting_ends_at,
    };

    it('requires authentication', async () => {
      const response = await request(app).post('/api/v1/proposals').send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ data: null, error: 'Authentication required' });
      expect(query).not.toHaveBeenCalled();
    });

    it('validates the request body with Zod', async () => {
      const response = await request(app)
        .post('/api/v1/proposals')
        .set('Authorization', authHeader())
        .send({ ...payload, title: '   ', votingEndsAt: 'yesterday' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.meta.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'title' }),
          expect.objectContaining({ path: 'votingEndsAt' }),
        ])
      );
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects a caller who is not an active community member', async () => {
      query.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/v1/proposals')
        .set('Authorization', authHeader())
        .send(payload);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        data: null,
        error: 'Only active community members can create proposals',
      });
    });

    it('creates an active proposal for an authenticated member', async () => {
      query.mockResolvedValue([proposal]);

      const response = await request(app)
        .post('/api/v1/proposals')
        .set('Authorization', authHeader())
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ data: proposal });
      expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO proposals'), [
        communityId,
        proposer,
        proposal.title,
        proposal.description,
        proposal.type,
        50,
        JSON.stringify(proposal.metadata),
        expect.any(Date),
      ]);
    });

    it('returns the standard envelope for unexpected database errors', async () => {
      query.mockRejectedValue(new Error('database unavailable'));

      const response = await request(app)
        .post('/api/v1/proposals')
        .set('Authorization', authHeader())
        .send(payload);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ data: null, error: 'Internal server error' });
    });
  });
});
