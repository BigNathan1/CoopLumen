import express from 'express';
import request from 'supertest';

const mockQuery = jest.fn();
const mockDetectDefaults = jest.fn();

jest.mock('../../../db', () => {
  const query = (...args: unknown[]) => mockQuery(...args);
  const transaction = (callback: (client: { query: typeof query }) => unknown) =>
    callback({ query });
  return { __esModule: true, default: { query, transaction }, db: { query, transaction }, query };
});

jest.mock('../../middleware/auth', () => ({
  __esModule: true,
  requireAuth: (req: { auth?: unknown }, _res: unknown, next: () => void) => {
    req.auth = { address: 'GBORROWER', userId: 'user-1' };
    next();
  },
}));

jest.mock('../../middleware/rateLimit', () => ({
  __esModule: true,
  writeLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../jobs/loanDefaults', () => ({
  __esModule: true,
  detectLoanDefaults: (...args: unknown[]) => mockDetectDefaults(...args),
}));

import { loanRouter } from '../loans';

const LOAN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/loans', loanRouter);
  return app;
}

function loanRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LOAN_ID,
    community_id: COMMUNITY_ID,
    borrower_address: 'GBORROWER',
    lender_address: 'GLENDER',
    amount: '100.0000000',
    amount_repaid: '0.0000000',
    status: 'pending',
    due_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockDetectDefaults.mockReset();
});

describe('GET /api/v1/loans/:id', () => {
  it('returns 404 for an unknown loan', async () => {
    mockQuery.mockResolvedValue([]);

    const res = await request(buildApp()).get(`/api/v1/loans/${LOAN_ID}`);

    expect(res.status).toBe(404);
  });

  it('returns the loan with its events', async () => {
    mockQuery
      .mockResolvedValueOnce([loanRow()])
      .mockResolvedValueOnce([{ id: 'event-1', loan_id: LOAN_ID, event_type: 'created' }]);

    const res = await request(buildApp()).get(`/api/v1/loans/${LOAN_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(LOAN_ID);
    expect(res.body.data.events).toHaveLength(1);
  });
});

describe('GET /api/v1/loans/:id/events', () => {
  it('paginates the event log', async () => {
    mockQuery.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ id: 'event-1' }]);

    const res = await request(buildApp()).get(`/api/v1/loans/${LOAN_ID}/events?page=1&limit=10`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });
});

describe('GET /api/v1/loans/borrower/:address', () => {
  it('rejects an invalid borrower address', async () => {
    const res = await request(buildApp()).get('/api/v1/loans/borrower/not-a-key');

    expect(res.status).toBe(400);
  });

  it('rejects invalid pagination', async () => {
    const res = await request(buildApp()).get(
      '/api/v1/loans/borrower/GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF?page=0'
    );

    expect(res.status).toBe(400);
  });

  it('lists the borrower loans', async () => {
    mockQuery.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([loanRow()]);

    const res = await request(buildApp()).get(
      '/api/v1/loans/borrower/GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });
});

describe('DELETE /api/v1/loans/:id', () => {
  it('returns 404 for an unknown loan', async () => {
    mockQuery.mockResolvedValue([]);

    const res = await request(buildApp()).delete(`/api/v1/loans/${LOAN_ID}`);

    expect(res.status).toBe(404);
  });

  it('refuses to cancel someone else’s loan', async () => {
    mockQuery.mockResolvedValue([
      loanRow({ borrower_address: 'GOTHER', lender_address: 'GOTHERLENDER' }),
    ]);

    const res = await request(buildApp()).delete(`/api/v1/loans/${LOAN_ID}`);

    expect(res.status).toBe(403);
  });

  it('refuses to cancel a disbursed loan', async () => {
    mockQuery.mockResolvedValueOnce([loanRow()]).mockResolvedValueOnce([]);

    const res = await request(buildApp()).delete(`/api/v1/loans/${LOAN_ID}`);

    expect(res.status).toBe(404);
  });

  it('cancels a pending loan', async () => {
    mockQuery.mockResolvedValueOnce([loanRow()]).mockResolvedValueOnce([{ id: LOAN_ID }]);

    const res = await request(buildApp()).delete(`/api/v1/loans/${LOAN_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: LOAN_ID, cancelled: true });
  });
});

describe('POST /api/v1/loans/detect-defaults', () => {
  it('returns the loans that defaulted', async () => {
    mockDetectDefaults.mockResolvedValue([{ id: LOAN_ID }]);

    const res = await request(buildApp()).post('/api/v1/loans/detect-defaults');

    expect(res.status).toBe(200);
    expect(res.body.meta.count).toBe(1);
  });

  it('returns a server error when detection fails', async () => {
    mockDetectDefaults.mockRejectedValue(new Error('boom'));

    const res = await request(buildApp()).post('/api/v1/loans/detect-defaults');

    expect(res.status).toBe(500);
  });
});
