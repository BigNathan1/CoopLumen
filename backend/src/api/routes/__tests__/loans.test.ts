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

import { loanRouter } from '../loans';

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_COMMUNITY_ID = '22222222-2222-4222-8222-222222222222';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/loans', loanRouter);
  return app;
}

function makeLoanRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    community_id: COMMUNITY_ID,
    borrower_address: 'GBORROWER000000000000000000000000000000000000000000000000',
    lender_address: null,
    amount: '100.0000000',
    amount_repaid: '0.0000000',
    status: 'pending',
    due_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Answers the two queries the list handler runs: the count, then the page. */
function mockListQueries(rows: Record<string, unknown>[], total: number): void {
  mockQuery.mockImplementation((sql: unknown) => {
    if (String(sql).includes('COUNT(*)')) return Promise.resolve([{ count: total }]);
    return Promise.resolve(rows);
  });
}

describe('GET /api/v1/loans/:communityId', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns only loans for the requested community', async () => {
    mockListQueries(
      [makeLoanRow(), makeLoanRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })],
      2
    );

    const res = await request(buildApp()).get(`/api/v1/loans/${COMMUNITY_ID}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    for (const loan of res.body.data) {
      expect(loan.communityId ?? loan.community_id).toBe(COMMUNITY_ID);
    }

    const firstCallParams = mockQuery.mock.calls[0][1] as unknown[];
    expect(firstCallParams).toContain(COMMUNITY_ID);
    expect(firstCallParams).not.toContain(OTHER_COMMUNITY_ID);
  });

  it.each(['active', 'pending', 'closed'] as const)('filters by status=%s', async (status) => {
    mockListQueries([makeLoanRow({ status })], 1);

    const res = await request(buildApp()).get(`/api/v1/loans/${COMMUNITY_ID}?status=${status}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe(status);

    const countSql = String(mockQuery.mock.calls[0][0]);
    expect(countSql).toContain(
      status === 'closed'
        ? `status IN ('repaid', 'defaulted', 'cancelled')`
        : `status = '${status}'`
    );
  });

  it('rejects a non-UUID communityId with a 400 envelope', async () => {
    const res = await request(buildApp()).get('/api/v1/loans/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('paginates results and returns pagination meta', async () => {
    mockListQueries([makeLoanRow()], 5);

    const res = await request(buildApp()).get(`/api/v1/loans/${COMMUNITY_ID}?page=2&limit=1`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.limit).toBe(1);
    expect(res.body.meta.total).toBe(5);
    expect(res.body.meta.pages).toBe(5);
  });

  it('returns an empty list with zero total when no loans match', async () => {
    mockListQueries([], 0);

    const res = await request(buildApp()).get(`/api/v1/loans/${COMMUNITY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('returns a 500 envelope when the database query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));

    const res = await request(buildApp()).get(`/api/v1/loans/${COMMUNITY_ID}`);

    expect(res.status).toBe(500);
  });
});

describe('POST /api/v1/loans/detect-defaults', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp()).post('/api/v1/loans/detect-defaults').send({});

    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/loans/:id/default', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp())
      .post('/api/v1/loans/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/default')
      .send({});

    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
