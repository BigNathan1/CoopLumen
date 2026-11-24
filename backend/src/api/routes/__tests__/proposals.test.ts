import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the router under test.
// ---------------------------------------------------------------------------

vi.mock('../../../services/stellar', () => ({
  getProposalsFromContract: vi.fn(),
  getProposalFromContract: vi.fn(),
  submitVoteXdr: vi.fn(),
  getProposalTally: vi.fn(),
}));

vi.mock('../../../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', stellarAddress: 'GUSER1' };
    next();
  },
}));

import proposalsRouter from '../proposals';
import {
  getProposalsFromContract,
  getProposalFromContract,
  submitVoteXdr,
  getProposalTally,
} from '../../../services/stellar';
import { db } from '../../../db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const PROPOSAL_ID = '22222222-2222-4222-8222-222222222222';
const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/proposals', proposalsRouter);
  return app;
}

/**
 * Builds a chainable drizzle-like select mock that resolves to `rows`.
 * Supports: db.select().from().where().limit() and .orderBy().
 */
function mockSelect(rows: any[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  (db.select as any).mockReturnValue(chain);
  return chain;
}

function mockInsert(rows: any[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
    onConflictDoNothing: vi.fn(() => chain),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  (db.insert as any).mockReturnValue(chain);
  return chain;
}

function mockUpdate(rows: any[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  (db.update as any).mockReturnValue(chain);
  return chain;
}

const baseProposal = {
  id: PROPOSAL_ID,
  communityId: COMMUNITY_ID,
  contractId: CONTRACT_ID,
  onChainId: 7,
  title: 'Fund the community garden',
  description: 'Allocate treasury funds for a community garden.',
  status: 'active',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  endsAt: new Date('2024-02-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/v1/proposals/:communityId
// ---------------------------------------------------------------------------

describe('GET /api/v1/proposals/:communityId', () => {
  it('returns proposals merged from contract and DB cache', async () => {
    (getProposalsFromContract as any).mockResolvedValue([
      {
        onChainId: 7,
        title: 'Fund the community garden',
        description: 'Allocate treasury funds for a community garden.',
        status: 'active',
        endsAt: '2024-02-01T00:00:00.000Z',
      },
      {
        onChainId: 8,
        title: 'New playground',
        description: 'Build a playground.',
        status: 'active',
        endsAt: '2024-03-01T00:00:00.000Z',
      },
    ]);

    mockSelect([baseProposal]);

    const res = await request(buildApp()).get(`/api/v1/proposals/${COMMUNITY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);

    const cached = res.body.data.find((p: any) => p.onChainId === 7);
    expect(cached).toBeDefined();
    expect(cached.id).toBe(PROPOSAL_ID);
    expect(cached.source).toBe('cache');

    const fresh = res.body.data.find((p: any) => p.onChainId === 8);
    expect(fresh).toBeDefined();
    expect(fresh.source).toBe('contract');
    expect(fresh.title).toBe('New playground');

    expect(getProposalsFromContract).toHaveBeenCalledWith(COMMUNITY_ID);
  });

  it('falls back to DB cache when the contract call fails', async () => {
    (getProposalsFromContract as any).mockRejectedValue(new Error('rpc down'));
    mockSelect([baseProposal]);

    const res = await request(buildApp()).get(`/api/v1/proposals/${COMMUNITY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(PROPOSAL_ID);
  });

  it('returns 400 for an invalid community id', async () => {
    const res = await request(buildApp()).get('/api/v1/proposals/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(getProposalsFromContract).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/proposals/:id
// ---------------------------------------------------------------------------

describe('GET /api/v1/proposals/:id', () => {
  it('returns proposal detail with aggregated vote tally', async () => {
    mockSelect([baseProposal]);
    (getProposalTally as any).mockResolvedValue({
      yes: '1500',
      no: '500',
      abstain: '100',
      totalVotes: '2100',
    });

    const res = await request(buildApp()).get(`/api/v1/proposals/${PROPOSAL_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.data.id).toBe(PROPOSAL_ID);
    expect(res.body.data.tally).toEqual({
      yes: '1500',
      no: '500',
      abstain: '100',
      totalVotes: '2100',
    });
    expect(getProposalTally).toHaveBeenCalledWith(PROPOSAL_ID);
  });

  it('returns 404 when the proposal does not exist', async () => {
    mockSelect([]);

    const res = await request(buildApp()).get(`/api/v1/proposals/${PROPOSAL_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for an invalid proposal id', async () => {
    const res = await request(buildApp()).get('/api/v1/proposals/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/proposals/:id/vote
// ---------------------------------------------------------------------------

describe('POST /api/v1/proposals/:id/vote', () => {
  const validXdr = 'AAAAAgAAAAB...signed-xdr...';

  it('submits a valid signed vote XDR to Soroban', async () => {
    mockSelect([baseProposal]);
    (submitVoteXdr as any).mockResolvedValue({
      hash: 'abc123hash',
      status: 'SUCCESS',
    });
    mockInsert([{ id: 'vote-1', proposalId: PROPOSAL_ID, userId: 'user-1' }]);

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/vote`)
      .send({ signedXdr: validXdr, choice: 'yes' });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.data.hash).toBe('abc123hash');
    expect(res.body.data.status).toBe('SUCCESS');
    expect(submitVoteXdr).toHaveBeenCalledWith(
      expect.objectContaining({ signedXdr: validXdr }),
    );
  });

  it('returns 400 for malformed XDR', async () => {
    mockSelect([baseProposal]);

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/vote`)
      .send({ signedXdr: 'not-valid-xdr', choice: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(submitVoteXdr).not.toHaveBeenCalled();
  });

  it('returns 400 when the XDR targets the wrong contract', async () => {
    mockSelect([baseProposal]);
    (submitVoteXdr as any).mockRejectedValue(
      Object.assign(new Error('Contract id mismatch'), { code: 'WRONG_CONTRACT' }),
    );

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/vote`)
      .send({ signedXdr: validXdr, choice: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('WRONG_CONTRACT');
  });

  it('returns 409 for a duplicate vote', async () => {
    mockSelect([baseProposal]);
    (submitVoteXdr as any).mockResolvedValue({
      hash: 'abc123hash',
      status: 'SUCCESS',
    });
    (db.insert as any).mockImplementation(() => {
      const chain: any = {
        values: vi.fn(() => chain),
        returning: vi.fn(() =>
          Promise.reject(
            Object.assign(new Error('duplicate key value violates unique constraint'), {
              code: '23505',
            }),
          ),
        ),
        then: (resolve: any, reject: any) =>
          Promise.reject(
            Object.assign(new Error('duplicate key value violates unique constraint'), {
              code: '23505',
            }),
          ).then(resolve, reject),
      };
      return chain;
    });

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/vote`)
      .send({ signedXdr: validXdr, choice: 'yes' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 when voting on a non-existent proposal', async () => {
    mockSelect([]);

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/vote`)
      .send({ signedXdr: validXdr, choice: 'yes' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(submitVoteXdr).not.toHaveBeenCalled();
  });
});