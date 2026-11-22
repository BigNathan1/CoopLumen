import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// In-memory data store used by the mocked repository layer. The route handlers
// are expected to talk to `../loans` (repository) and `../../services/loans`
// (business logic). We mock both so the tests exercise the HTTP surface
// (validation, status codes, envelope shape) without a real database.
// ---------------------------------------------------------------------------

interface LoanRow {
  id: string;
  borrower_address: string;
  lender_address: string;
  principal_amount: string;
  outstanding_amount: string;
  status: 'requested' | 'active' | 'repaid' | 'overdue' | 'defaulted' | 'cancelled';
  due_at: string;
  created_at: string;
}

interface RepaymentRow {
  id: string;
  loan_id: string;
  amount: string;
  paid_at: string;
}

const loans: LoanRow[] = [];
const repayments: RepaymentRow[] = [];

const resetStore = () => {
  loans.length = 0;
  repayments.length = 0;
};

const seedLoan = (overrides: Partial<LoanRow> = {}): LoanRow => {
  const loan: LoanRow = {
    id: 'loan-1',
    borrower_address: 'GBORROWER111111111111111111111111111111111111111111111',
    lender_address: 'GLENDER1111111111111111111111111111111111111111111111',
    principal_amount: '100.0000000',
    outstanding_amount: '100.0000000',
    status: 'active',
    due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
  loans.push(loan);
  return loan;
};

// ---------------------------------------------------------------------------
// Mock the repository + service modules. The exact module paths mirror the
// project layout; adjust the relative specifiers if the real files live
// elsewhere, but keep the exported function names stable.
// ---------------------------------------------------------------------------

jest.mock('../../loans', () => {
  const actual = jest.requireActual('../../loans') as Record<string, unknown>;
  return {
    ...actual,
    findLoanById: jest.fn(async (id: string) => loans.find((l) => l.id === id) ?? null),
    findLoansByBorrower: jest.fn(
      async (address: string, limit: number, offset: number) => {
        const matching = loans.filter((l) => l.borrower_address === address);
        return {
          rows: matching.slice(offset, offset + limit),
          total: matching.length,
        };
      },
    ),
    insertRepayment: jest.fn(async (input: { loan_id: string; amount: string }) => {
      const row: RepaymentRow = {
        id: `repay-${repayments.length + 1}`,
        loan_id: input.loan_id,
        amount: input.amount,
        paid_at: new Date().toISOString(),
      };
      repayments.push(row);
      return row;
    }),
    updateLoanOutstanding: jest.fn(
      async (id: string, outstanding: string, status: LoanRow['status']) => {
        const loan = loans.find((l) => l.id === id);
        if (!loan) return null;
        loan.outstanding_amount = outstanding;
        loan.status = status;
        return loan;
      },
    ),
  };
});

// ---------------------------------------------------------------------------
// Build a minimal Express app that mounts the loans router. The router is
// imported after the mocks are registered so it picks up the mocked deps.
// ---------------------------------------------------------------------------

let app: Express;

beforeEach(async () => {
  resetStore();
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: loansRouter } = require('../loans');
  app = express();
  app.use(express.json());
  app.use('/api/v1/loans', loansRouter);
  // Mirror the project-wide error envelope middleware.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.issues },
      });
    }
    const status = err.status ?? 500;
    return res.status(status).json({
      data: null,
      error: { code: err.code ?? 'INTERNAL_ERROR', message: err.message ?? 'Internal error' },
    });
  });
});

afterEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// POST /api/v1/loans/:id/repay
// ---------------------------------------------------------------------------

describe('POST /api/v1/loans/:id/repay', () => {
  it('accepts a partial repayment and keeps the loan active', async () => {
    const loan = seedLoan({ outstanding_amount: '100.0000000' });

    const res = await request(app)
      .post(`/api/v1/loans/${loan.id}/repay`)
      .send({ borrower_address: loan.borrower_address, amount: '40.0000000' });

    expect(res.status).toBe(201);
    expect(res.body.error).toBeUndefined();
    expect(res.body.data).toMatchObject({
      loan_id: loan.id,
      amount: '40.0000000',
      outstanding_amount: '60.0000000',
      status: 'active',
    });
    expect(loans[0].outstanding_amount).toBe('60.0000000');
    expect(loans[0].status).toBe('active');
    expect(repayments).toHaveLength(1);
  });

  it('accepts a full repayment and transitions the loan to repaid', async () => {
    const loan = seedLoan({ outstanding_amount: '100.0000000' });

    const res = await request(app)
      .post(`/api/v1/loans/${loan.id}/repay`)
      .send({ borrower_address: loan.borrower_address, amount: '100.0000000' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      loan_id: loan.id,
      amount: '100.0000000',
      outstanding_amount: '0.0000000',
      status: 'repaid',
    });
    expect(loans[0].status).toBe('repaid');
    expect(loans[0].outstanding_amount).toBe('0.0000000');
  });

  it('rejects an overpayment with 400', async () => {
    const loan = seedLoan({ outstanding_amount: '50.0000000' });

    const res = await request(app)
      .post(`/api/v1/loans/${loan.id}/repay`)
      .send({ borrower_address: loan.borrower_address, amount: '75.0000000' });

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('OVERPAYMENT');
    expect(repayments).toHaveLength(0);
    expect(loans[0].outstanding_amount).toBe('50.0000000');
  });

  it('rejects a repayment from a different borrower with 403', async () => {
    const loan = seedLoan();

    const res = await request(app)
      .post(`/api/v1/loans/${loan.id}/repay`)
      .send({
        borrower_address: 'GOTHER1111111111111111111111111111111111111111111111',
        amount: '10.0000000',
      });

    expect(res.status).toBe(403);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(repayments).toHaveLength(0);
  });

  it('rejects repayment on a non-active loan with 409', async () => {
    const loan = seedLoan({ status: 'repaid', outstanding_amount: '0.0000000' });

    const res = await request(app)
      .post(`/api/v1/loans/${loan.id}/repay`)
      .send({ borrower_address: loan.borrower_address, amount: '10.0000000' });

    expect(res.status).toBe(409);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('LOAN_NOT_ACTIVE');
    expect(repayments).toHaveLength(0);
  });

  it('returns 404 when the loan does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/loans/does-not-exist/repay')
      .send({
        borrower_address: 'GBORROWER111111111111111111111111111111111111111111111',
        amount: '10.0000000',
      });

    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('LOAN_NOT_FOUND');
  });

  it('returns 400 for an invalid body (missing amount)', async () => {
    const loan = seedLoan();

    const res = await request(app)
      .post(`/api/v1/loans/${loan.id}/repay`)
      .send({ borrower_address: loan.borrower_address });

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repayments).toHaveLength(0);
  });

  it('returns 400 for an invalid body (non-positive amount)', async () => {
    const loan = seedLoan();

    const res = await request(app)
      .post(`/api/v1/loans/${loan.id}/repay`)
      .send({ borrower_address: loan.borrower_address, amount: '0' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for an invalid body (malformed address)', async () => {
    const loan = seedLoan();

    const res = await request(app)
      .post(`/api/v1/loans/${loan.id}/repay`)
      .send({ borrower_address: 'not-a-stellar-address', amount: '10.0000000' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/loans/borrower/:address
// ---------------------------------------------------------------------------

describe('GET /api/v1/loans/borrower/:address', () => {
  const borrowerA = 'GBORROWER111111111111111111111111111111111111111111111';
  const borrowerB = 'GBORROWER222222222222222222222222222222222222222222222';

  it('returns only the loans belonging to the requested address', async () => {
    seedLoan({ id: 'a-1', borrower_address: borrowerA });
    seedLoan({ id: 'a-2', borrower_address: borrowerA });
    seedLoan({ id: 'b-1', borrower_address: borrowerB });

    const res = await request(app).get(`/api/v1/loans/borrower/${borrowerA}`);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((l: LoanRow) => l.id).sort()).toEqual(['a-1', 'a-2']);
    expect(res.body.data.every((l: LoanRow) => l.borrower_address === borrowerA)).toBe(true);
  });

  it('includes pagination meta', async () => {
    seedLoan({ id: 'a-1', borrower_address: borrowerA });
    seedLoan({ id: 'a-2', borrower_address: borrowerA });
    seedLoan({ id: 'a-3', borrower_address: borrowerA });

    const res = await request(app)
      .get(`/api/v1/loans/borrower/${borrowerA}`)
      .query({ limit: 2, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({
      total: 3,
      limit: 2,
      offset: 0,
      has_more: true,
    });
  });

  it('returns an empty array for an address with no loans', async () => {
    seedLoan({ borrower_address: borrowerA });

    const res = await request(app).get(`/api/v1/loans/borrower/${borrowerB}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ total: 0 });
  });

  it('returns 400 for an invalid address', async () => {
    const res = await request(app).get('/api/v1/loans/borrower/not-a-stellar-address');

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

```typescript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// In-memory store for the loan-expiry job tests. The job is expected to query
// active loans whose `due_at` has passed and flip them to `overdue`. We mock
// the repository module so the job runs against this store.
// ---------------------------------------------------------------------------

interface LoanRow {
  id: string;
  status: 'requested' | 'active' | 'repaid' | 'overdue' | 'defaulted' | 'cancelled';
  due_at: string;
}

const loans: LoanRow[] = [];

const resetStore = () => {
  loans.length = 0;
};

const seedLoan = (overrides: Partial<LoanRow> = {}): LoanRow => {
  const loan: LoanRow = {
    id: `loan-${loans.length + 1}`,
    status: 'active',
    due_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
  loans.push(loan);
  return loan;
};

jest.mock('../../loans', () => {
  const actual = jest.requireActual('../../loans') as Record<string, unknown>;
  return {
    ...actual,
    findActiveLoansPastDue: jest.fn(async () => {
      const now = Date.now();
      return loans.filter(
        (l) => l.status === 'active' && new Date(l.due_at).getTime() < now,
      );
    }),
    markLoanOverdue: jest.fn(async (id: string) => {
      const loan = loans.find((l) => l.id === id);
      if (!loan) return null;
      loan.status = 'overdue';
      return loan;
    }),
  };
});

// Import after mocks are registered.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runLoanExpiryJob } = require('../../services/loanExpiry') as {
  runLoanExpiryJob: () => Promise<{ marked: number }>;
};

beforeEach(() => {
  resetStore();
  jest.clearAllMocks();
});

afterEach(() => {
  resetStore();
});

describe('runLoanExpiryJob', () => {
  it('marks only active past-due loans as overdue', async () => {
    const pastDueActive = seedLoan({
      id: 'past-due-active',
      status: 'active',
      due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const futureActive = seedLoan({
      id: 'future-active',
      status: 'active',
      due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const pastDueRepaid = seedLoan({
      id: 'past-due-repaid',
      status: 'repaid',
      due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const pastDueRequested = seedLoan({
      id: 'past-due-requested',
      status: 'requested',
      due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const alreadyOverdue = seedLoan({
      id: 'already-overdue',
      status: 'overdue',
      due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    const result = await runLoanExpiryJob();

    expect(result.marked).toBe(1);
    expect(pastDueActive.status).toBe('overdue');
    expect(futureActive.status).toBe('active');
    expect(pastDueRepaid.status).toBe('repaid');
    expect(pastDueRequested.status).toBe('requested');
    expect(alreadyOverdue.status).toBe('overdue');
  });

  it('is a no-op on a second run', async () => {
    seedLoan({
      id: 'past-due-active',
      status: 'active',
      due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    const first = await runLoanExpiryJob();
    expect(first.marked).toBe(1);

    const second = await runLoanExpiryJob();
    expect(second.marked).toBe(0);

    // The loan remains overdue and is not double-processed.
    expect(loans[0].status).toBe('overdue');
  });

  it('does nothing when there are no past-due active loans', async () => {
    seedLoan({
      id: 'future-active',
      status: 'active',
      due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const result = await runLoanExpiryJob();

    expect(result.marked).toBe(0);
    expect(loans[0].status).toBe('active');
  });
});