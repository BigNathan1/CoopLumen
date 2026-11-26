import express from 'express';
import request from 'supertest';

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();

jest.mock('../../../db', () => {
  const query = (...args: unknown[]) => mockQuery(...args);
  // pg clients answer with { rows }, unlike the db.query wrapper.
  const clientQuery = (...args: unknown[]) =>
    Promise.resolve(mockClientQuery(...args)).then((result) =>
      Array.isArray(result) ? { rows: result } : result
    );
  const transaction = (callback: (client: { query: typeof clientQuery }) => unknown) =>
    callback({ query: clientQuery });

  return {
    __esModule: true,
    default: { query, transaction },
    db: { query, transaction },
    query,
    transaction,
  };
});

jest.mock('../../middleware/auth', () => ({
  __esModule: true,
  requireAuth: (req: { auth?: unknown }, _res: unknown, next: () => void) => {
    req.auth = {
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      userId: 'user-1',
    };
    next();
  },
}));

jest.mock('../../../contracts/xdrValidation', () => ({
  __esModule: true,
  validateXdr: jest.fn(),
  inspectVoteXdr: jest.fn(),
}));

jest.mock('../../../contracts/stellar', () => ({
  __esModule: true,
  fetchProposalsForCommunity: jest.fn(),
  fetchProposalTally: jest.fn(),
  submitVoteTransaction: jest.fn(),
  executeProposalOnChain: jest.fn(),
}));

import { Keypair } from '@stellar/stellar-sdk';

import { proposalRouter } from '../proposals';
import {
  executeProposalOnChain,
  fetchProposalTally,
  fetchProposalsForCommunity,
  submitVoteTransaction,
} from '../../../contracts/stellar';
import { inspectVoteXdr, validateXdr } from '../../../contracts/xdrValidation';

const mockedValidateXdr = validateXdr as jest.Mock;
const mockedInspectVoteXdr = inspectVoteXdr as jest.Mock;
const mockedFetchProposals = fetchProposalsForCommunity as jest.Mock;
const mockedFetchTally = fetchProposalTally as jest.Mock;
const mockedSubmitVote = submitVoteTransaction as jest.Mock;
const mockedExecute = executeProposalOnChain as jest.Mock;

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const PROPOSAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const DELEGATEE = Keypair.random().publicKey();

const PROPOSAL = {
  id: PROPOSAL_ID,
  community_id: COMMUNITY_ID,
  proposer_address: MEMBER,
  title: 'Fund the garden',
  description: null,
  type: 'general',
  status: 'active',
  quorum_percent: '50',
  metadata: null,
  voting_starts_at: '2026-01-01T00:00:00.000Z',
  voting_ends_at: '2099-01-01T00:00:00.000Z',
  executed_at: null,
  stellar_tx_hash: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  votes_for: '3',
  votes_against: '1',
  votes_abstain: '0',
  total_weight: '4',
};

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/proposals', proposalRouter);
  return app;
}

/** Default answers for every query the router can issue. */
function mockDefaults(): void {
  mockQuery.mockImplementation((sql: unknown) => {
    const text = String(sql);
    if (text.includes('INSERT INTO proposals')) return Promise.resolve([{ id: PROPOSAL_ID }]);
    if (text.includes('FROM proposals p')) return Promise.resolve([PROPOSAL]);
    if (text.includes('FROM members')) return Promise.resolve([{ exists: true }]);
    if (text.includes('FROM votes')) {
      return Promise.resolve([
        {
          votes_for: '3',
          votes_against: '1',
          votes_abstain: '0',
          total_weight: '4',
          count_for: '2',
          count_against: '1',
          count_abstain: '0',
        },
      ]);
    }
    return Promise.resolve([]);
  });
}

function proposalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...PROPOSAL, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockClientQuery.mockReset();
  mockDefaults();
  mockedValidateXdr.mockReturnValue({ valid: true });
  mockedInspectVoteXdr.mockReturnValue({
    targetsVoteMethod: true,
    proposalId: PROPOSAL_ID,
    choice: 'for',
    weight: '1',
  });
  mockedFetchProposals.mockResolvedValue([]);
  mockedFetchTally.mockResolvedValue(null);
  mockedSubmitVote.mockResolvedValue({ hash: 'hash-1', status: 'PENDING' });
  mockedExecute.mockResolvedValue({ txHash: 'exec-hash' });
});

describe('POST /api/v1/proposals', () => {
  const body = { communityId: COMMUNITY_ID, title: 'Fund the garden' };

  it('rejects a proposal without a title', async () => {
    const res = await request(buildApp()).post('/api/v1/proposals').send({});

    expect(res.status).toBe(400);
  });

  it('requires active community membership', async () => {
    mockQuery.mockImplementation((sql: unknown) =>
      String(sql).includes('FROM members')
        ? Promise.resolve([{ exists: false }])
        : Promise.resolve([])
    );

    const res = await request(buildApp()).post('/api/v1/proposals').send(body);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/membership/i);
  });

  it('creates the proposal for a member', async () => {
    const res = await request(buildApp()).post('/api/v1/proposals').send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(PROPOSAL_ID);
  });

  it('returns a server error when the insert fails', async () => {
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('INSERT INTO proposals')) return Promise.reject(new Error('boom'));
      if (text.includes('FROM members')) return Promise.resolve([{ exists: true }]);
      return Promise.resolve([]);
    });

    const res = await request(buildApp()).post('/api/v1/proposals').send(body);

    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/proposals', () => {
  it('lists proposals filtered by status', async () => {
    const res = await request(buildApp()).get(
      `/api/v1/proposals?communityId=${COMMUNITY_ID}&status=active`
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns one proposal with its tally', async () => {
    const res = await request(buildApp()).get(`/api/v1/proposals/${PROPOSAL_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.proposal.id).toBe(PROPOSAL_ID);
    expect(res.body.data.tally).toEqual({
      for: '3',
      against: '1',
      abstain: '0',
      totalWeight: '4',
      counts: { for: 2, against: 1, abstain: 0 },
    });
  });

  it('still answers when the on-chain tally is unavailable', async () => {
    mockedFetchTally.mockRejectedValue(new Error('rpc down'));

    const res = await request(buildApp()).get(`/api/v1/proposals/${PROPOSAL_ID}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown proposal', async () => {
    mockQuery.mockImplementation((sql: unknown) =>
      String(sql).includes('FROM proposals p') ? Promise.resolve([]) : Promise.resolve([])
    );

    const res = await request(buildApp()).get(`/api/v1/proposals/${PROPOSAL_ID}`);

    expect(res.status).toBe(404);
  });

  it('reports the contract as the source when the chain read works', async () => {
    mockedFetchProposals.mockResolvedValue([
      {
        id: PROPOSAL_ID,
        communityId: COMMUNITY_ID,
        proposer: PROPOSAL.proposer_address,
        title: 'On chain',
        description: null,
        status: 'active',
        createdAt: 0,
        votingEndsAt: 0,
        votesFor: '0',
        votesAgainst: '0',
        votesAbstain: '0',
      },
    ]);

    const res = await request(buildApp()).get(`/api/v1/proposals/community/${COMMUNITY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('chain');
  });

  it('falls back to the cache when the chain read fails', async () => {
    mockedFetchProposals.mockRejectedValue(new Error('rpc down'));

    const res = await request(buildApp()).get(`/api/v1/proposals/community/${COMMUNITY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('cache');
  });
});

describe('POST /api/v1/proposals/:id/vote', () => {
  const vote = { signedXdr: 'AAAA' };

  it('rejects a malformed proposal id', async () => {
    const res = await request(buildApp()).post('/api/v1/proposals/not-a-uuid/vote').send(vote);

    expect(res.status).toBe(400);
  });

  it('rejects a malformed XDR envelope', async () => {
    mockedValidateXdr.mockReturnValue({ valid: false, error: 'Malformed XDR' });

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/vote`).send(vote);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed XDR');
  });

  it('rejects an envelope that does not target this vote', async () => {
    mockedInspectVoteXdr.mockReturnValue({ targetsVoteMethod: false });

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/vote`).send(vote);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/XDR/);
  });

  it('returns 404 when the proposal does not exist', async () => {
    mockQuery.mockResolvedValue([]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/vote`).send(vote);

    expect(res.status).toBe(404);
  });

  it('returns 409 when the member already voted', async () => {
    mockQuery.mockImplementation((sql: unknown) => {
      if (String(sql).includes('FROM proposals p')) return Promise.resolve([PROPOSAL]);
      const error = Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'votes_unique_per_voter',
      });
      return Promise.reject(error);
    });

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/vote`).send(vote);

    expect(res.status).toBe(409);
  });

  it('records a signed vote', async () => {
    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/vote`).send(vote);

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ txHash: 'hash-1', status: 'PENDING' });
  });
});

describe('POST /api/v1/proposals/:id/votes', () => {
  const vote = { choice: 'for' };

  it('returns 404 inside the transaction when the proposal is missing', async () => {
    mockClientQuery.mockResolvedValue([]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/votes`).send(vote);

    expect(res.status).toBe(404);
  });

  it('returns 409 when voting is closed', async () => {
    mockClientQuery.mockResolvedValueOnce([
      { community_id: COMMUNITY_ID, status: 'passed', voting_ends_at: new Date(Date.now() - 1000) },
    ]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/votes`).send(vote);

    expect(res.status).toBe(409);
  });

  it('requires active membership', async () => {
    mockClientQuery
      .mockResolvedValueOnce([
        {
          community_id: COMMUNITY_ID,
          status: 'active',
          voting_ends_at: new Date(Date.now() + 100_000),
        },
      ])
      .mockResolvedValueOnce([{ exists: false }]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/votes`).send(vote);

    expect(res.status).toBe(403);
  });

  it('returns 409 on a duplicate vote', async () => {
    mockClientQuery
      .mockResolvedValueOnce([
        {
          community_id: COMMUNITY_ID,
          status: 'active',
          voting_ends_at: new Date(Date.now() + 100_000),
        },
      ])
      .mockResolvedValueOnce([{ exists: true }])
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'votes_unique_per_voter',
        })
      );

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/votes`).send(vote);

    expect(res.status).toBe(409);
  });

  it('records the vote and returns the updated proposal', async () => {
    mockClientQuery
      .mockResolvedValueOnce([
        {
          community_id: COMMUNITY_ID,
          status: 'active',
          voting_ends_at: new Date(Date.now() + 100_000),
        },
      ])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/votes`).send(vote);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(PROPOSAL_ID);
  });
});

describe('POST /api/v1/proposals/:id/execute', () => {
  it('returns 404 for an unknown proposal', async () => {
    mockQuery.mockResolvedValue([]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/execute`);

    expect(res.status).toBe(404);
  });

  it('refuses to execute twice', async () => {
    mockQuery.mockResolvedValue([proposalRow({ status: 'executed' })]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/execute`);

    expect(res.status).toBe(409);
  });

  it.each(['rejected', 'cancelled'])('refuses to execute a %s proposal', async (status) => {
    mockQuery.mockResolvedValue([proposalRow({ status })]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/execute`);

    expect(res.status).toBe(409);
  });

  it('waits for an open voting period to end', async () => {
    mockQuery.mockResolvedValue([
      proposalRow({ status: 'active', voting_ends_at: '2099-01-01T00:00:00.000Z' }),
    ]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/execute`);

    expect(res.status).toBe(409);
  });

  it('executes a passed proposal', async () => {
    mockQuery.mockResolvedValue([proposalRow({ status: 'passed' })]);

    const res = await request(buildApp()).post(`/api/v1/proposals/${PROPOSAL_ID}/execute`);

    expect(res.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith({
      proposalId: PROPOSAL_ID,
      communityId: COMMUNITY_ID,
      proposerAddress: PROPOSAL.proposer_address,
    });
  });
});

describe('POST /api/v1/proposals/:id/delegate', () => {
  function mockDelegationRows(overrides: Record<string, unknown> = {}): void {
    mockClientQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('FOR UPDATE')) {
        return Promise.resolve([
          {
            id: PROPOSAL_ID,
            community_id: COMMUNITY_ID,
            status: 'active',
            voting_ends_at: new Date(Date.now() + 100_000),
            ...overrides,
          },
        ]);
      }
      if (text.includes('FROM members')) {
        return Promise.resolve([{ stellar_address: MEMBER }, { stellar_address: DELEGATEE }]);
      }
      if (text.includes('FROM votes')) return Promise.resolve([]);
      if (text.includes('FROM proposal_delegations')) return Promise.resolve([{ exists: false }]);
      return Promise.resolve([
        {
          proposal_id: PROPOSAL_ID,
          delegator_address: MEMBER,
          delegatee_address: DELEGATEE,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  }

  it('rejects delegating to yourself', async () => {
    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/delegate`)
      .send({ delegateeAddress: MEMBER });

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown proposal', async () => {
    mockClientQuery.mockResolvedValue([]);

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/delegate`)
      .send({ delegateeAddress: DELEGATEE });

    expect(res.status).toBe(404);
  });

  it('refuses after voting closes', async () => {
    mockDelegationRows({ status: 'passed' });

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/delegate`)
      .send({ delegateeAddress: DELEGATEE });

    expect(res.status).toBe(409);
  });

  it('requires both accounts to be active members', async () => {
    mockClientQuery.mockImplementation((sql: unknown) => {
      if (String(sql).includes('FOR UPDATE')) {
        return Promise.resolve([
          {
            id: PROPOSAL_ID,
            community_id: COMMUNITY_ID,
            status: 'active',
            voting_ends_at: new Date(Date.now() + 100_000),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/delegate`)
      .send({ delegateeAddress: DELEGATEE });

    expect(res.status).toBe(403);
  });

  it('refuses to delegate after either account voted', async () => {
    mockClientQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('FOR UPDATE')) {
        return Promise.resolve([
          {
            id: PROPOSAL_ID,
            community_id: COMMUNITY_ID,
            status: 'active',
            voting_ends_at: new Date(Date.now() + 100_000),
          },
        ]);
      }
      if (text.includes('FROM members')) {
        return Promise.resolve([{ stellar_address: MEMBER }, { stellar_address: DELEGATEE }]);
      }
      return Promise.resolve([{ voter_address: DELEGATEE }]);
    });

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/delegate`)
      .send({ delegateeAddress: DELEGATEE });

    expect(res.status).toBe(409);
  });

  it('refuses delegation chains', async () => {
    mockDelegationRows();
    mockClientQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('FOR UPDATE')) {
        return Promise.resolve([
          {
            id: PROPOSAL_ID,
            community_id: COMMUNITY_ID,
            status: 'active',
            voting_ends_at: new Date(Date.now() + 100_000),
          },
        ]);
      }
      if (text.includes('FROM members')) {
        return Promise.resolve([{ stellar_address: MEMBER }, { stellar_address: DELEGATEE }]);
      }
      if (text.includes('FROM votes')) return Promise.resolve([]);
      return Promise.resolve([{ exists: true }]);
    });

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/delegate`)
      .send({ delegateeAddress: DELEGATEE });

    expect(res.status).toBe(409);
  });

  it('saves a valid delegation', async () => {
    mockDelegationRows();

    const res = await request(buildApp())
      .post(`/api/v1/proposals/${PROPOSAL_ID}/delegate`)
      .send({ delegateeAddress: DELEGATEE });

    expect(res.status).toBe(200);
    expect(res.body.data.delegateeAddress).toBe(DELEGATEE);
  });
});
