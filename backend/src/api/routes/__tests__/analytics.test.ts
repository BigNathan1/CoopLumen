import request from 'supertest';
import express from 'express';
import { analyticsRouter } from '../analytics';
import { errorHandler } from '../../middleware/errorHandler';
import { db } from '../../../db';

jest.mock('../../../db', () => ({ db: { query: jest.fn() } }));

const app = express();
app.use('/api/v1/analytics', analyticsRouter);
app.use(errorHandler);

const query = db.query as jest.Mock;
const communityId = '11111111-1111-4111-8111-111111111111';

const summary = {
  total_loans: 5,
  active_loans: 2,
  repaid_loans: 2,
  defaulted_loans: 1,
  total_disbursed: '500.0000000',
  total_repaid: '250.0000000',
  total_outstanding: '275.0000000',
};

describe('GET /api/v1/analytics/:communityId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a community id that is not a UUID', async () => {
    const res = await request(app).get('/api/v1/analytics/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.errors[0].path).toBe('communityId');
    expect(query).not.toHaveBeenCalled();
  });

  it('returns the loan totals and repayment rate', async () => {
    query.mockResolvedValueOnce([summary]);

    const res = await request(app).get(`/api/v1/analytics/${communityId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      community_id: communityId,
      asset_code: null,
      ...summary,
    });
    expect(res.body.data.repayment_rate).toBeCloseTo(0.6667, 4);
    expect(query.mock.calls[0][1]).toEqual([communityId]);
  });

  it('filters by asset code when one is given', async () => {
    query.mockResolvedValueOnce([summary]);

    const res = await request(app).get(`/api/v1/analytics/${communityId}?assetCode=ECO`);

    expect(res.status).toBe(200);
    expect(res.body.data.asset_code).toBe('ECO');
    expect(query.mock.calls[0][0]).toContain('AND asset_code = $2');
    expect(query.mock.calls[0][1]).toEqual([communityId, 'ECO']);
  });

  it('reports a null repayment rate when no loan has closed', async () => {
    query.mockResolvedValueOnce([{ ...summary, repaid_loans: 0, defaulted_loans: 0 }]);

    const res = await request(app).get(`/api/v1/analytics/${communityId}`);

    expect(res.body.data.repayment_rate).toBeNull();
  });

  it('hands a database failure to the error handler without exposing it', async () => {
    query.mockRejectedValueOnce(new Error('connection to 10.0.0.5 refused'));

    const res = await request(app).get(`/api/v1/analytics/${communityId}`);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });
});
