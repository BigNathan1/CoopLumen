import request from 'supertest';
import app from '../../../app';
import { db } from '../../../db';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
    ping: jest.fn().mockResolvedValue(true),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const communityId = '11111111-1111-4111-8111-111111111111';

describe('DELETE /api/v1/communities/:id', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('soft-deletes an active community', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: communityId }]);

    const res = await request(app).delete(`/api/v1/communities/${communityId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { deleted: true } });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('SET deleted_at = NOW()'),
      [communityId]
    );
  });

  it('rejects an invalid community UUID', async () => {
    const res = await request(app).delete('/api/v1/communities/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'id' }),
      ])
    );
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('returns 404 when the community does not exist or was already deleted', async () => {
    mockDb.query.mockResolvedValueOnce([]);

    const res = await request(app).delete(`/api/v1/communities/${communityId}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Community not found' });
  });
});
