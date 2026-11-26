import express from 'express';
import request from 'supertest';

const mockQuery = jest.fn();

jest.mock('../../../db', () => {
  const query = (...args: unknown[]) => mockQuery(...args);
  return {
    __esModule: true,
    default: { query },
    db: { query },
    query,
  };
});

jest.mock('../../../contracts/stellar', () => ({
  __esModule: true,
  fetchProposalsForCommunity: jest.fn(),
  fetchProposalTally: jest.fn(),
  submitVoteTransaction: jest.fn(),
  executeProposalOnChain: jest.fn(),
}));

import { proposalRouter } from '../proposals';
import { fetchProposalsForCommunity } from '../../../contracts/stellar';

const mockedFetchProposals = fetchProposalsForCommunity as jest.Mock;

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const PROPOSAL = { id: 'proposal-1', title: 'Fund the garden' };

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/proposals', proposalRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([PROPOSAL]);
});

describe('GET /api/v1/proposals/:communityId', () => {
  it('returns the cached proposals and reports the contract as the source', async () => {
    mockedFetchProposals.mockResolvedValue([]);

    const res = await request(buildApp()).get(`/api/v1/proposals/${COMMUNITY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([PROPOSAL]);
    expect(res.body.meta).toEqual({ count: 1, source: 'chain' });
    expect(mockedFetchProposals).toHaveBeenCalledWith(COMMUNITY_ID);
  });

  it('falls back to the DB cache when the contract call fails', async () => {
    mockedFetchProposals.mockRejectedValue(new Error('rpc down'));

    const res = await request(buildApp()).get(`/api/v1/proposals/${COMMUNITY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('cache');
    expect(res.body.data).toHaveLength(1);
  });

  it('rejects an invalid community id with a 400 envelope', async () => {
    const res = await request(buildApp()).get('/api/v1/proposals/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(mockedFetchProposals).not.toHaveBeenCalled();
  });

  it('returns a 500 envelope when the cached query fails', async () => {
    mockedFetchProposals.mockResolvedValue([]);
    mockQuery.mockRejectedValue(new Error('db down'));

    const res = await request(buildApp()).get(`/api/v1/proposals/${COMMUNITY_ID}`);

    expect(res.status).toBe(500);
  });
});
