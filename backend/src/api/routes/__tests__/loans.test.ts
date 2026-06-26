import request from 'supertest';
import { PoolClient } from 'pg';
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
const borrower = Keypair.random().publicKey();
const lender = Keypair.random().publicKey();
const communityId = '11111111-1111-4111-8111-111111111111';
const loanId = '22222222-2222-4222-8222-222222222222';

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
    expect(res.body.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
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

describe('POST /api/v1/loans', () => {
  it('rejects an invalid payload', async () => {
    const res = await request(app).post('/api/v1/loans').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('rejects an invalid Stellar address', async () => {
    const res = await request(app).post('/api/v1/loans').send({
      communityId,
      borrowerAddress: 'bad',
      lenderAddress: lender,
      amount: '50',
      assetCode: 'ECO',
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the community is missing', async () => {
    mockDb.query.mockResolvedValueOnce([]); // community lookup
    const res = await request(app).post('/api/v1/loans').send({
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
    const res = await request(app).post('/api/v1/loans').send({
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
  it('rejects disbursing a non-pending loan', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId, status: 'active' }]);
    const res = await request(app).post(`/api/v1/loans/${loanId}/disburse`).send({});
    expect(res.status).toBe(409);
  });

  it('disburses a pending loan', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: loanId, status: 'pending', amount: '50.0000000', lender_address: lender },
    ]);
    runTransaction([[{ id: loanId, status: 'active' }]]);
    const res = await request(app).post(`/api/v1/loans/${loanId}/disburse`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });
});

describe('POST /api/v1/loans/:id/repay', () => {
  it('rejects a repayment above the outstanding balance', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: loanId, status: 'active', amount: '50.0000000', amount_repaid: '0' },
    ]);
    const res = await request(app).post(`/api/v1/loans/${loanId}/repay`).send({ amount: '60' });
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
    runTransaction([[{ id: loanId, status: 'active', amount_repaid: '20.0000000' }]]);
    const res = await request(app).post(`/api/v1/loans/${loanId}/repay`).send({ amount: '20' });
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
    runTransaction([[{ id: loanId, status: 'repaid', amount_repaid: '50.0000000' }]]);
    const res = await request(app).post(`/api/v1/loans/${loanId}/repay`).send({ amount: '20' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('repaid');
  });
});

describe('POST /api/v1/loans/:id/default', () => {
  it('rejects defaulting a non-active loan', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId, status: 'pending' }]);
    const res = await request(app).post(`/api/v1/loans/${loanId}/default`).send({});
    expect(res.status).toBe(409);
  });

  it('defaults an active loan', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: loanId, status: 'active', borrower_address: borrower, lender_address: lender },
    ]);
    runTransaction([[{ id: loanId, status: 'defaulted' }]]);
    const res = await request(app).post(`/api/v1/loans/${loanId}/default`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('defaulted');
  });
});

describe('DELETE /api/v1/loans/:id', () => {
  it('cancels a pending loan', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: loanId }]);
    const res = await request(app).delete(`/api/v1/loans/${loanId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.cancelled).toBe(true);
  });

  it('returns 404 when there is no pending loan to cancel', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).delete(`/api/v1/loans/${loanId}`);
    expect(res.status).toBe(404);
  });
});
