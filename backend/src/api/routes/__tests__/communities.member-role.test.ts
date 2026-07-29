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
const communityId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/communities/:id/members role filter', () => {
  it('filters members by role and returns pagination metadata', async () => {
    mockDb.query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([
      {
        community_id: communityId,
        stellar_address: 'G' + 'F'.repeat(55),
        role: 'treasurer',
      },
    ]);

    const res = await request(app).get(`/api/v1/communities/${communityId}/members?role=treasurer`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].role).toBe('treasurer');
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 20, pages: 1 });
    expect(mockDb.query).toHaveBeenNthCalledWith(1, expect.stringContaining('role = $2'), [
      communityId,
      'treasurer',
    ]);
  });

  it('rejects an unsupported role with the validation envelope', async () => {
    const res = await request(app).get(`/api/v1/communities/${communityId}/members?role=owner`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'role' })])
    );
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});
