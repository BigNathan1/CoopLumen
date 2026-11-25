import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import analyticsRouter from '../analytics';
import { db } from '../../db';

vi.mock('../../db', () => ({ db: { query: vi.fn() } }));

const app = express();
app.use('/api/v1/analytics', analyticsRouter);

describe('GET /api/v1/analytics/:communityId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with error envelope for invalid communityId', async () => {
    const res = await request(app).get('/api/v1/analytics/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns aggregated loan analytics in { data } envelope', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [
        {
          total_loans: 5,
          active_loans: 2,
          repaid_loans: 2,
          defaulted_loans: 1,
          total_disbursed: '500.0000000',
          total_repaid: '250.0000000',
          total_outstanding: '275.0000000',
        },
      ],
    } as any);

    const communityId = '11111111-1111-4111-8111-111111111111';
    const res = await request(app).get(`/api/v1/analytics/${communityId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total_loans).toBe(5);
    expect(res.body.data.repayment_rate).toBeCloseTo(0.6667, 4);
  });
});