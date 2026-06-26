import { Router, Request, Response, NextFunction } from 'express';
import { PoolClient } from 'pg';
import { db } from '../../db';
import { parsePagination, pageMeta, parseSort, queryString } from '../utils/http';
import { validateBody } from '../middleware/validate';
import { writeLimiter } from '../middleware/rateLimit';
import {
  createLoanSchema,
  disburseLoanSchema,
  repayLoanSchema,
  defaultLoanSchema,
} from '../schemas/loan';

export const loanRouter = Router();

interface Loan {
  id: string;
  community_id: string;
  borrower_address: string;
  lender_address: string;
  amount: string;
  amount_repaid: string;
  asset_code: string;
  asset_issuer: string | null;
  purpose: string | null;
  status: string;
  due_at: string | null;
  disbursed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LoanEvent {
  id: string;
  loan_id: string;
  event_type: string;
  amount: string | null;
  payment_id: string | null;
  note: string | null;
  created_at: string;
}

const VALID_STATUS = ['pending', 'active', 'repaid', 'defaulted', 'cancelled'];

/**
 * Upserts a borrower's reputation row and recomputes their score from their
 * on-time-repayment and default counts using a smoothed success ratio (so a
 * member with no history sits near the neutral midpoint rather than 0 or 100).
 */
async function bumpReputation(
  client: PoolClient,
  communityId: string,
  address: string,
  field: 'total_loans' | 'on_time_repayments' | 'defaults'
): Promise<void> {
  const {
    rows: [row],
  } = await client.query<{ on_time_repayments: number; defaults: number }>(
    `INSERT INTO reputation_scores (stellar_address, community_id, ${field})
     VALUES ($1, $2, 1)
     ON CONFLICT (stellar_address, community_id)
     DO UPDATE SET ${field} = reputation_scores.${field} + 1
     RETURNING on_time_repayments, defaults`,
    [address, communityId]
  );

  const onTime = Number(row.on_time_repayments);
  const defaults = Number(row.defaults);
  const score = Math.round(((100 * (onTime + 1)) / (onTime + defaults + 2)) * 100) / 100;

  await client.query(
    `UPDATE reputation_scores
     SET score = $1, last_calculated_at = NOW()
     WHERE stellar_address = $2 AND community_id = $3`,
    [score, address, communityId]
  );
}

/**
 * GET /api/loans
 * Paginated, filterable list of loans.
 * Query: page, limit, communityId, borrower, lender, status,
 *        sortBy (created_at|amount|due_at|updated_at), order (asc|desc)
 */
loanRouter.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req);
    const { sortBy, order } = parseSort(
      req,
      ['created_at', 'amount', 'due_at', 'updated_at'],
      'created_at'
    );

    const clauses: string[] = [];
    const params: unknown[] = [];
    const filters: Record<string, string> = {
      community_id: queryString(req.query.communityId).trim(),
      borrower_address: queryString(req.query.borrower).trim(),
      lender_address: queryString(req.query.lender).trim(),
    };
    for (const [column, value] of Object.entries(filters)) {
      if (value) {
        params.push(value);
        clauses.push(`${column} = $${params.length}`);
      }
    }
    const status = queryString(req.query.status).trim();
    if (status && VALID_STATUS.includes(status)) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [{ count }] = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM loans ${where}`,
      params
    );

    const listParams = [...params, pagination.limit, pagination.offset];
    const loans = await db.query<Loan>(
      `SELECT * FROM loans ${where}
       ORDER BY ${sortBy} ${order}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({ data: loans, meta: pageMeta(count, pagination) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/loans/:id
 * Single loan with its full event history and a repayment summary.
 */
loanRouter.get('/:id', async (req, res, next) => {
  try {
    const [loan] = await db.query<Loan>('SELECT * FROM loans WHERE id = $1', [req.params.id]);
    if (!loan) {
      res.status(404).json({ error: 'Loan not found' });
      return;
    }
    const events = await db.query<LoanEvent>(
      'SELECT * FROM loan_events WHERE loan_id = $1 ORDER BY created_at',
      [loan.id]
    );
    const outstanding = Number(loan.amount) - Number(loan.amount_repaid);
    res.json({
      data: {
        ...loan,
        outstanding: outstanding.toFixed(7),
        events,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/loans/:id/events
 * Chronological event log for a single loan.
 */
loanRouter.get('/:id/events', async (req, res, next) => {
  try {
    const events = await db.query<LoanEvent>(
      'SELECT * FROM loan_events WHERE loan_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/loans
 * Records a new loan request (status `pending`), seeds a `created` loan event,
 * an audit entry, and the borrower's loan tally.
 */
loanRouter.post(
  '/',
  writeLimiter,
  validateBody(createLoanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        communityId,
        borrowerAddress,
        lenderAddress,
        amount,
        assetCode,
        assetIssuer,
        purpose,
        dueAt,
      } = req.body as {
        communityId: string;
        borrowerAddress: string;
        lenderAddress: string;
        amount: string;
        assetCode: string;
        assetIssuer?: string;
        purpose?: string;
        dueAt?: Date;
      };

      const [community] = await db.query<{ id: string }>(
        'SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL',
        [communityId]
      );
      if (!community) {
        res.status(404).json({ error: 'Community not found' });
        return;
      }

      const loan = await db.transaction(async (client) => {
        const {
          rows: [created],
        } = await client.query<Loan>(
          `INSERT INTO loans
             (community_id, borrower_address, lender_address, amount, asset_code, asset_issuer, purpose, due_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            communityId,
            borrowerAddress,
            lenderAddress,
            amount,
            assetCode,
            assetIssuer ?? null,
            purpose ?? null,
            dueAt ?? null,
          ]
        );
        await client.query(
          `INSERT INTO loan_events (loan_id, event_type, amount, note)
           VALUES ($1, 'created', $2, $3)`,
          [created.id, amount, purpose ?? null]
        );
        await client.query(
          `INSERT INTO transactions_log (community_id, actor_address, action, metadata)
           VALUES ($1, $2, 'loan_created', $3)`,
          [
            communityId,
            lenderAddress,
            JSON.stringify({ loan_id: created.id, amount, asset_code: assetCode }),
          ]
        );
        await bumpReputation(client, communityId, borrowerAddress, 'total_loans');
        return created;
      });

      res.status(201).json({ data: loan });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/loans/:id/disburse
 * Transitions a `pending` loan to `active` once funds have been sent.
 */
loanRouter.post(
  '/:id/disburse',
  writeLimiter,
  validateBody(disburseLoanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { stellarTxHash, note } = req.body as { stellarTxHash?: string; note?: string };

      const [loan] = await db.query<Loan>('SELECT * FROM loans WHERE id = $1', [req.params.id]);
      if (!loan) {
        res.status(404).json({ error: 'Loan not found' });
        return;
      }
      if (loan.status !== 'pending') {
        res.status(409).json({ error: `Cannot disburse a loan in status "${loan.status}"` });
        return;
      }

      const updated = await db.transaction(async (client) => {
        const {
          rows: [row],
        } = await client.query<Loan>(
          `UPDATE loans SET status = 'active', disbursed_at = NOW() WHERE id = $1 RETURNING *`,
          [loan.id]
        );
        await client.query(
          `INSERT INTO loan_events (loan_id, event_type, amount, note)
           VALUES ($1, 'disbursed', $2, $3)`,
          [loan.id, loan.amount, note ?? null]
        );
        await client.query(
          `INSERT INTO transactions_log (community_id, actor_address, action, stellar_tx_hash, metadata)
           VALUES ($1, $2, 'loan_disbursed', $3, $4)`,
          [
            loan.community_id,
            loan.lender_address,
            stellarTxHash ?? null,
            JSON.stringify({ loan_id: loan.id, amount: loan.amount }),
          ]
        );
        return row;
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/loans/:id/repay
 * Records a (partial or full) repayment. When the outstanding balance reaches
 * zero the loan is marked `repaid` and the borrower's on-time tally increases.
 */
loanRouter.post(
  '/:id/repay',
  writeLimiter,
  validateBody(repayLoanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, paymentId, note } = req.body as {
        amount: string;
        paymentId?: string;
        note?: string;
      };

      const [loan] = await db.query<Loan>('SELECT * FROM loans WHERE id = $1', [req.params.id]);
      if (!loan) {
        res.status(404).json({ error: 'Loan not found' });
        return;
      }
      if (loan.status !== 'active') {
        res.status(409).json({ error: `Cannot repay a loan in status "${loan.status}"` });
        return;
      }

      const outstanding = Number(loan.amount) - Number(loan.amount_repaid);
      if (Number(amount) > outstanding + 1e-7) {
        res.status(400).json({
          error: 'Repayment exceeds outstanding balance',
          outstanding: outstanding.toFixed(7),
        });
        return;
      }

      const newRepaid = Number(loan.amount_repaid) + Number(amount);
      const fullyRepaid = newRepaid >= Number(loan.amount) - 1e-7;

      const updated = await db.transaction(async (client) => {
        const {
          rows: [row],
        } = await client.query<Loan>(
          `UPDATE loans
           SET amount_repaid = $1,
               status = $2,
               closed_at = $3
           WHERE id = $4
           RETURNING *`,
          [
            newRepaid.toFixed(7),
            fullyRepaid ? 'repaid' : 'active',
            fullyRepaid ? new Date() : null,
            loan.id,
          ]
        );
        await client.query(
          `INSERT INTO loan_events (loan_id, event_type, amount, payment_id, note)
           VALUES ($1, 'repayment', $2, $3, $4)`,
          [loan.id, amount, paymentId ?? null, note ?? null]
        );
        await client.query(
          `INSERT INTO transactions_log (community_id, actor_address, action, metadata)
           VALUES ($1, $2, 'loan_repayment', $3)`,
          [
            loan.community_id,
            loan.borrower_address,
            JSON.stringify({ loan_id: loan.id, amount, fully_repaid: fullyRepaid }),
          ]
        );
        if (fullyRepaid) {
          await client.query(
            `INSERT INTO loan_events (loan_id, event_type, note)
             VALUES ($1, 'closed', 'Loan fully repaid')`,
            [loan.id]
          );
          await client.query(
            `INSERT INTO transactions_log (community_id, actor_address, action, metadata)
             VALUES ($1, $2, 'loan_closed', $3)`,
            [loan.community_id, loan.borrower_address, JSON.stringify({ loan_id: loan.id })]
          );
          await bumpReputation(
            client,
            loan.community_id,
            loan.borrower_address,
            'on_time_repayments'
          );
        }
        return row;
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/loans/:id/default
 * Marks an `active` loan as defaulted and records it against the borrower's
 * reputation.
 */
loanRouter.post(
  '/:id/default',
  writeLimiter,
  validateBody(defaultLoanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { note } = req.body as { note?: string };

      const [loan] = await db.query<Loan>('SELECT * FROM loans WHERE id = $1', [req.params.id]);
      if (!loan) {
        res.status(404).json({ error: 'Loan not found' });
        return;
      }
      if (loan.status !== 'active') {
        res.status(409).json({ error: `Cannot default a loan in status "${loan.status}"` });
        return;
      }

      const updated = await db.transaction(async (client) => {
        const {
          rows: [row],
        } = await client.query<Loan>(
          `UPDATE loans SET status = 'defaulted', closed_at = NOW() WHERE id = $1 RETURNING *`,
          [loan.id]
        );
        await client.query(
          `INSERT INTO loan_events (loan_id, event_type, note)
           VALUES ($1, 'defaulted', $2)`,
          [loan.id, note ?? null]
        );
        await client.query(
          `INSERT INTO transactions_log (community_id, actor_address, action, metadata)
           VALUES ($1, $2, 'loan_defaulted', $3)`,
          [loan.community_id, loan.lender_address, JSON.stringify({ loan_id: loan.id })]
        );
        await bumpReputation(client, loan.community_id, loan.borrower_address, 'defaults');
        return row;
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/loans/:id
 * Cancels a loan that has not yet been disbursed (status `pending`).
 */
loanRouter.delete('/:id', writeLimiter, async (req, res, next) => {
  try {
    const result = await db.query<{ id: string }>(
      `UPDATE loans SET status = 'cancelled'
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [req.params.id]
    );
    if (result.length === 0) {
      res.status(404).json({ error: 'No pending loan found to cancel' });
      return;
    }
    res.json({ data: { id: result[0].id, cancelled: true } });
  } catch (err) {
    next(err);
  }
});
