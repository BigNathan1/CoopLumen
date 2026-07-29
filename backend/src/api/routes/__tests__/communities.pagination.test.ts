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
const validKey = Keypair.random().publicKey();
const communityId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/communities/:id/members pagination', () => {
  it('returns the requested page with pagination metadata', async () => {
    const member = {
      community_id: communityId,
      stellar_address: validKey,
      role: 'member',
    };

    mockDb.query
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([member]);

    const res = await request(app).get(
      `/api/v1/communities/${communityId}/members?page=2&limit=1`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [member],
      meta: { total: 3, page: 2, limit: 1, pages: 3 },
    });
  });

  it('uses the default page and limit when pagination is omitted', async () => {
    mockDb.query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);

    const res = await request(app).get(`/api/v1/communities/${communityId}/members`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });
});
