import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
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
const address = Keypair.random().publicKey();
const communityId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/reputation', () => {
  it('returns an empty leaderboard with pagination meta', async () => {
    mockDb.query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/reputation');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });

  it('returns scores filtered by community', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([
        { id: 'r-1', stellar_address: address, community_id: communityId, score: '87.50' },
      ]);
    const res = await request(app).get(`/api/v1/reputation?communityId=${communityId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].score).toBe('87.50');
  });
});

describe('GET /api/v1/reputation/:address', () => {
  it('returns 404 when the address has no reputation', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).get(`/api/v1/reputation/${address}`);
    expect(res.status).toBe(404);
  });

  it('aggregates a member reputation across communities', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: 'r-1',
        stellar_address: address,
        community_id: communityId,
        score: '90.00',
        total_loans: 3,
        on_time_repayments: 2,
        defaults: 0,
      },
      {
        id: 'r-2',
        stellar_address: address,
        community_id: '22222222-2222-4222-8222-222222222222',
        score: '50.00',
        total_loans: 1,
        on_time_repayments: 0,
        defaults: 1,
      },
    ]);
    const res = await request(app).get(`/api/v1/reputation/${address}`);
    expect(res.status).toBe(200);
    expect(res.body.data.communities).toHaveLength(2);
    expect(res.body.data.summary).toEqual({
      total_loans: 4,
      on_time_repayments: 2,
      defaults: 1,
    });
  });
});
