import request from 'supertest';
import app from '../../../app';
import { db } from '../../../db';

jest.mock('../../../db', () => ({
  db: {
    query: jest.fn(),
  },
}));

const communityId = '11111111-1111-4111-8111-111111111111';

const sampleRow = {
  id: '22222222-2222-4222-8222-222222222222',
  community_id: communityId,
  actor_address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZAB',
  action: 'payment_sent',
  stellar_tx_hash: 'a'.repeat(64),
  metadata: { amount: '10.0000000' },
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('GET /api/v1/transactions/history/:communityId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 for an invalid community ID UUID', async () => {
    const res = await request(app).get('/api/v1/transactions/history/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 404 when the community does not exist', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app).get(`/api/v1/transactions/history/${communityId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Community not found');
  });

  it('returns a paginated page of transaction log entries', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce([{ id: communityId }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([sampleRow]);

    const res = await request(app).get(`/api/v1/transactions/history/${communityId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([sampleRow]);
    expect(res.body.meta).toMatchObject({ total: 1, page: 1, limit: 20, pages: 1 });
  });

  it('rejects a malformed from date', async () => {
    const res = await request(app).get(
      `/api/v1/transactions/history/${communityId}?from=not-a-date`
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects to before from', async () => {
    const res = await request(app).get(
      `/api/v1/transactions/history/${communityId}?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z`
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects an unrecognised type', async () => {
    const res = await request(app).get(
      `/api/v1/transactions/history/${communityId}?type=not_a_real_action`
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('filters by date range and type, passing them through as query params', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce([{ id: communityId }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);

    const res = await request(app).get(
      `/api/v1/transactions/history/${communityId}?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&type=payment_sent`
    );

    expect(res.status).toBe(200);

    const countCall = (db.query as jest.Mock).mock.calls[1];
    expect(countCall[0]).toContain('created_at >= $2');
    expect(countCall[0]).toContain('created_at <= $3');
    expect(countCall[0]).toContain('action = $4');
    expect(countCall[1]).toEqual([
      communityId,
      '2026-01-01T00:00:00Z',
      '2026-02-01T00:00:00Z',
      'payment_sent',
    ]);
  });
});
