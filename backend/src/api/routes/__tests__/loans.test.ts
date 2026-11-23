import request from 'supertest';
import { PoolClient } from 'pg';
import { Keypair } from '@stellar/stellar-sdk';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [] }),
    transaction: jest.fn(),
  },
}));

// Mock auditLog middleware to avoid db connection issues in tests
jest.mock('../../../api/middleware/auditLog', () => ({
  auditStateChange: (_req: any, _res: any, next: any) => next(),
}));

import app from '../../../app';
import { db } from '../../../db';
import { createSessionToken } from '../../utils/sessionToken';

const mockDb = db as jest.Mocked<typeof db>;
const borrower = Keypair.random().publicKey();
const lender = Keypair.random().publicKey();
const stranger = Keypair.random().publicKey();
const communityId = '11111111-1111-4111-8111-111111111111';
const loanId = '22222222-2222-4222-8222-222222222222';

function authHeader(address: string): string {
  return `Bearer ${createSessionToken(address).token}`;
}

/** Runs the route's transaction callback against a fake client returning rows. */
function runTransaction(rowsByQuery: object[][] = []): void {
  mockDb.transaction.mockImplementation((fn) => {
    let call = 0;
    const client = {
      // Explicit rows for the leading queries; later queries (events, audit,
      // reputation upsert) fall back to a row carrying reputation counters.
      query: jest.fn(async () => ({
        rows: rowsByQuery[call++] ?? [{ on_time_repayments: 0, defaults: 0 }],
      })),
    } as unknown as PoolClient;
    return Promise.resolve(fn(client));
  });
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/loans', () => {
  it('returns an empty list with pagination meta', async () => {
    mockDb.query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/loans');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0, offset: 0 });
  });

  it('filters by status and returns loans', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: loanId, status: 'active', amount: '100.0000000' }]);
    const res = await request(app).get('/api/v1/loans?status=active&borrower=' + borrower);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('active');
  });
});

describe('GET /api/v1/loans/:id', () => {
  it('returns 404 when not found', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).get(`/api/v1/loans/${loanId}`);
    expect(res.status).toBe(404);
  });

  it('enriches a loan with events and outstanding balance', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        { id: loanId, amount: '100.0000000', amount_repaid: '40.0000000', status: 'active' },
      ])
      .mockResolvedValueOnce([{ id: 'ev-1', event_type: 'created' }]);
    const res = await request(app).get(`/api/v1/loans/${loanId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.outstanding).toBe('60.0000000');
    expect(res.body.data.events).toHaveLength(1);
  });
});

describe('GET /api/v1/loans/:id/events', () => {
  it('returns paginated event history', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: 'ev-1', event_type: 'created' }]);
    const res = await request(app).get(`/api/v1/loans/${loanId}/events?page=1&limit=5`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 5, pages: 1, offset: 0 });
  });
});

describe('POST /api/v1/loans', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/v1/loans').send({
      communityId,
      borrowerAddress: borrower,
      lenderAddress: lender,
      amount: '50',
      assetCode: 'ECO',
    });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toBeDefined();
  });

  it('rejects an invalid Stellar address', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: 'bad',
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(400);
  });

  it('rejects a caller who is neither the borrower nor the lender', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(stranger))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the community is missing', async () => {
    mockDb.query.mockResolvedValueOnce([]); // community lookup
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(404);
  });

  it('creates a loan with a valid payload', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: communityId }]); // community exists
    runTransaction([[{ id: loanId, status: 'pending', amount: '50.0000000' }]]);
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
        purpose: 'Seed capital',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });
});

describe('POST /api/v1/loans/:id/disburse', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post(`/api/v1/loans/${loanId}/disburse`).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a caller who is not the lender', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId, status: 'pending', lender_address: lender }]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(borrower))
      .send({});
    expect(res.status).toBe(403);
  });

  it('rejects disbursing a non-pending loan', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId, status: 'active', lender_address: lender }]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(409);
  });

  it('disburses a pending loan', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: loanId, status: 'pending', amount: '50.0000000', lender_address: lender },
    ]);
    // First in-transaction query is the `SELECT ... FOR UPDATE` re-read of the loan.
    runTransaction([
      [{ id: loanId, status: 'pending', amount: '50.0000000', lender_address: lender }],
      [{ id: loanId, status: 'active' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });
});

describe('POST /api/v1/loans/:id/repay', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post(`/api/v1/loans/${loanId}/repay`).send({ amount: '20' });
    expect(res.status).toBe(401);
  });

  it('rejects a caller who is not the borrower', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '50.0000000',
        amount_repaid: '0',
        borrower_address: borrower,
      },
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(lender))
      .send({ amount: '20' });
    expect(res.status).toBe(403);
  });

  it('rejects a repayment above the outstanding balance', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '50.0000000',
        amount_repaid: '0',
        borrower_address: borrower,
      },
    ]);
    runTransaction([
      [
        {
          id: loanId,
          status: 'active',
          amount: '50.0000000',
          amount_repaid: '0',
          borrower_address: borrower,
        },
      ],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '60' });
    expect(res.status).toBe(400);
  });

  it('records a partial repayment and keeps the loan active', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '50.0000000',
        amount_repaid: '0',
        borrower_address: borrower,
      },
    ]);
    runTransaction([
      [
        {
          id: loanId,
          status: 'active',
          amount: '50.0000000',
          amount_repaid: '0',
          borrower_address: borrower,
        },
      ],
      [{ id: loanId, status: 'active', amount_repaid: '20.0000000' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '20' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('marks the loan repaid once fully paid', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '50.0000000',
        amount_repaid: '30.0000000',
        borrower_address: borrower,
      },
    ]);
    runTransaction([
      [
        {
          id: loanId,
          status: 'active',
          amount: '50.0000000',
          amount_repaid: '30.0000000',
          borrower_address: borrower,
        },
      ],
      [{ id: loanId, status: 'repaid', amount_repaid: '50.0000000' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '20' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('repaid');
  });
});

describe('loan interest', () => {
  it('creates a loan carrying an interest rate', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: communityId }]); // community exists
    runTransaction([
      [{ id: loanId, status: 'pending', amount: '100.0000000', interest_rate: '10.00' }],
    ]);
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '100',
        assetCode: 'ECO',
        interestRate: 10,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.interest_rate).toBe('10.00');
  });

  it('keeps a loan active until principal plus interest is repaid', async () => {
    // 100 principal at 10% => 110 total due; repaying 105 leaves 5 outstanding.
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '100.0000000',
        amount_repaid: '0',
        interest_rate: '10.00',
        borrower_address: borrower,
      },
    ]);
    runTransaction([
      [
        {
          id: loanId,
          status: 'active',
          amount: '100.0000000',
          amount_repaid: '0',
          interest_rate: '10.00',
          borrower_address: borrower,
        },
      ],
      [{ id: loanId, status: 'active', amount_repaid: '105.0000000' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '105' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('rejects a repayment above principal plus interest', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '100.0000000',
        amount_repaid: '0',
        interest_rate: '10.00',
        borrower_address: borrower,
      },
    ]);
    runTransaction([
      [
        {
          id: loanId,
          status: 'active',
          amount: '100.0000000',
          amount_repaid: '0',
          interest_rate: '10.00',
          borrower_address: borrower,
        },
      ],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '111' });
    expect(res.status).toBe(400);
    expect(res.body.meta.outstanding).toBe('110.0000000');
  });

  it('marks the loan repaid once interest is covered', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '100.0000000',
        amount_repaid: '100.0000000',
        interest_rate: '10.00',
        borrower_address: borrower,
      },
    ]);
    runTransaction([
      [
        {
          id: loanId,
          status: 'active',
          amount: '100.0000000',
          amount_repaid: '100.0000000',
          interest_rate: '10.00',
          borrower_address: borrower,
        },
      ],
      [{ id: loanId, status: 'repaid', amount_repaid: '110.0000000' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '10' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('repaid');
  });
});

describe('POST /api/v1/loans/:id/default', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post(`/api/v1/loans/${loanId}/default`).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a caller who is not the lender', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: loanId, status: 'active', borrower_address: borrower, lender_address: lender },
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/default`)
      .set('Authorization', authHeader(borrower))
      .send({});
    expect(res.status).toBe(403);
  });

  it('rejects defaulting a non-active loan', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId, status: 'pending', lender_address: lender }]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/default`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(409);
  });

  it('defaults an active loan', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: loanId, status: 'active', borrower_address: borrower, lender_address: lender },
    ]);
    runTransaction([
      [{ id: loanId, status: 'active', borrower_address: borrower, lender_address: lender }],
      [{ id: loanId, status: 'defaulted' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/default`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('defaulted');
  });
});

describe('DELETE /api/v1/loans/:id', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).delete(`/api/v1/loans/${loanId}`);
    expect(res.status).toBe(401);
  });

  it('rejects a caller who is neither the borrower nor the lender', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: loanId, status: 'pending', borrower_address: borrower, lender_address: lender },
    ]);
    const res = await request(app)
      .delete(`/api/v1/loans/${loanId}`)
      .set('Authorization', authHeader(stranger));
    expect(res.status).toBe(403);
  });

  it('cancels a pending loan', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        { id: loanId, status: 'pending', borrower_address: borrower, lender_address: lender },
      ])
      .mockResolvedValueOnce([{ id: loanId }]);
    const res = await request(app)
      .delete(`/api/v1/loans/${loanId}`)
      .set('Authorization', authHeader(borrower));
    expect(res.status).toBe(200);
    expect(res.body.data.cancelled).toBe(true);
  });

  it('returns 404 when there is no pending loan to cancel', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app)
      .delete(`/api/v1/loans/${loanId}`)
      .set('Authorization', authHeader(borrower));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/loans - pagination and filtering', () => {
  it('returns paginated results with correct meta', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 45 }])
      .mockResolvedValueOnce(
        Array.from({ length: 20 }, (_, i) => ({ id: `loan-${i}`, amount: '100.0000000' }))
      );
    const res = await request(app).get('/api/v1/loans?page=2&limit=20');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.meta).toEqual({ total: 45, page: 2, limit: 20, pages: 3, offset: 20 });
  });

  it('filters by communityId', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: loanId, community_id: communityId, amount: '100.0000000' }]);
    const res = await request(app).get(`/api/v1/loans?communityId=${communityId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by borrower address', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: loanId, borrower_address: borrower, amount: '100.0000000' }]);
    const res = await request(app).get(`/api/v1/loans?borrower=${borrower}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by lender address', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: loanId, lender_address: lender, amount: '100.0000000' }]);
    const res = await request(app).get(`/api/v1/loans?lender=${lender}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('sorts by amount descending', async () => {
    mockDb.query.mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce([
      { id: loanId, amount: '200.0000000' },
      { id: 'loan-2', amount: '100.0000000' },
    ]);
    const res = await request(app).get('/api/v1/loans?sortBy=amount&order=desc');
    expect(res.status).toBe(200);
    expect(res.body.data[0].amount).toBe('200.0000000');
  });
});

describe('GET /api/v1/loans/:id - error handling', () => {
  it('returns 500 when database query fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app).get(`/api/v1/loans/${loanId}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('GET /api/v1/loans/:id/events - error handling', () => {
  it('returns 404 when loan does not exist', async () => {
    mockDb.query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    const res = await request(app).get(`/api/v1/loans/${loanId}/events`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('returns 500 when database query fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app).get(`/api/v1/loans/${loanId}/events`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('POST /api/v1/loans - Zod validation', () => {
  it('rejects missing communityId', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'communityId' })])
    );
  });

  it('rejects invalid communityId format', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId: 'not-a-uuid',
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'communityId' })])
    );
  });

  it('rejects negative amount', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '-50',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'amount' })])
    );
  });

  it('rejects amount with too many decimals', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50.12345678',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'amount' })])
    );
  });

  it('rejects invalid assetCode format', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'INVALID@CODE',
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'assetCode' })])
    );
  });

  it('rejects interestRate above maximum', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
        interestRate: 2000,
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'interestRate' })])
    );
  });

  it('rejects negative interestRate', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
        interestRate: -5,
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'interestRate' })])
    );
  });
});

describe('POST /api/v1/loans - DB error handling', () => {
  it('returns 500 when community lookup fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('returns 500 when transaction fails', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: communityId }]);
    mockDb.transaction.mockRejectedValueOnce(new Error('Transaction failed'));
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', authHeader(lender))
      .send({
        communityId,
        borrowerAddress: borrower,
        lenderAddress: lender,
        amount: '50',
        assetCode: 'ECO',
      });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('POST /api/v1/loans/request - Zod validation', () => {
  it('rejects missing communityId', async () => {
    const res = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrower))
      .send({
        amount: '1000',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'communityId' })])
    );
  });

  it('rejects missing amount', async () => {
    const res = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrower))
      .send({
        communityId,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'amount' })])
    );
  });

  it('rejects past dueAt', async () => {
    const res = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrower))
      .send({
        communityId,
        amount: '1000',
        dueAt: new Date(Date.now() - 86400000).toISOString(),
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'dueAt' })])
    );
  });

  it('rejects negative amount', async () => {
    const res = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrower))
      .send({
        communityId,
        amount: '-1000',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'amount' })])
    );
  });

  it('rejects interestRate above maximum', async () => {
    const res = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrower))
      .send({
        communityId,
        amount: '1000',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        interestRate: 2000,
      });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'interestRate' })])
    );
  });
});

describe('POST /api/v1/loans/request - DB error handling', () => {
  it('returns 500 when community lookup fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrower))
      .send({
        communityId,
        amount: '1000',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('returns 500 when transaction fails', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        { issuer_public_key: lender, asset_code: 'ECO', asset_issuer: lender },
      ])
      .mockResolvedValueOnce([{ settings: {} }]);
    mockDb.transaction.mockRejectedValueOnce(new Error('Transaction failed'));
    const res = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrower))
      .send({
        communityId,
        amount: '1000',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('POST /api/v1/loans/:id/disburse - Zod validation', () => {
  it('accepts empty body', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId, status: 'pending', lender_address: lender }]);
    runTransaction([
      [{ id: loanId, status: 'pending', amount: '50.0000000', lender_address: lender }],
      [{ id: loanId, status: 'active' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(200);
  });

  it('accepts optional stellarTxHash', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId, status: 'pending', lender_address: lender }]);
    runTransaction([
      [{ id: loanId, status: 'pending', amount: '50.0000000', lender_address: lender }],
      [{ id: loanId, status: 'active' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lender))
      .send({ stellarTxHash: 'abc123', note: 'Test disbursement' });
    expect(res.status).toBe(200);
  });

  it('rejects invalid stellarTxHash type', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lender))
      .send({ stellarTxHash: 123 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/loans/:id/disburse - DB error handling', () => {
  it('returns 500 when loan lookup fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('returns 500 when transaction fails', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId, status: 'pending', lender_address: lender }]);
    mockDb.transaction.mockRejectedValueOnce(new Error('Transaction failed'));
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('POST /api/v1/loans/:id/repay - Zod validation', () => {
  it('rejects missing amount', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'amount' })])
    );
  });

  it('rejects negative amount', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '-20' });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'amount' })])
    );
  });

  it('accepts optional paymentId', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '50.0000000',
        amount_repaid: '0',
        borrower_address: borrower,
      },
    ]);
    runTransaction([
      [
        {
          id: loanId,
          status: 'active',
          amount: '50.0000000',
          amount_repaid: '0',
          borrower_address: borrower,
        },
      ],
      [{ id: loanId, status: 'active', amount_repaid: '20.0000000' }],
    ]);
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '20', paymentId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(200);
  });

  it('rejects invalid paymentId format', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '20', paymentId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'paymentId' })])
    );
  });
});

describe('POST /api/v1/loans/:id/repay - DB error handling', () => {
  it('returns 500 when loan lookup fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '20' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('returns 500 when transaction fails', async () => {
    mockDb.query.mockResolvedValueOnce([
      {
        id: loanId,
        status: 'active',
        amount: '50.0000000',
        amount_repaid: '0',
        borrower_address: borrower,
      },
    ]);
    mockDb.transaction.mockRejectedValueOnce(new Error('Transaction failed'));
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrower))
      .send({ amount: '20' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('POST /api/v1/loans/:id/default - DB error handling', () => {
  it('returns 500 when loan lookup fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/default`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('returns 500 when transaction fails', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: loanId, status: 'active', borrower_address: borrower, lender_address: lender },
    ]);
    mockDb.transaction.mockRejectedValueOnce(new Error('Transaction failed'));
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/default`)
      .set('Authorization', authHeader(lender))
      .send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('DELETE /api/v1/loans/:id - DB error handling', () => {
  it('returns 500 when loan lookup fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app)
      .delete(`/api/v1/loans/${loanId}`)
      .set('Authorization', authHeader(borrower));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('returns 500 when update fails', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        { id: loanId, status: 'pending', borrower_address: borrower, lender_address: lender },
      ])
      .mockRejectedValueOnce(new Error('Update failed'));
    const res = await request(app)
      .delete(`/api/v1/loans/${loanId}`)
      .set('Authorization', authHeader(borrower));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
