import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { parsePagination, pageMeta, parseSort, queryString } from '../utils/http';
import { validateParams, validateQuery } from '../middleware/validate';

export const reputationRouter = Router();

interface ReputationScore {
  id: string;
  stellar_address: string;
  community_id: string;
  score: string;
  total_loans: number;
  on_time_repayments: number;
  defaults: number;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

interface QueryClient {
  query<T extends object = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** Neutral score used when a member has no loan history yet. */
const NEUTRAL_SCORE = 50;

export const reputationAddressParamsSchema = z.object({
  address: z.string().trim().min(1, 'address is required'),
});

export const reputationQuerySchema = z.object({
  communityId: z.string().trim().min(1).optional(),
});

interface ReputationCalculation {
  score: number;
  totalLoans: number;
  onTimeRepayments: number;
  defaults: number;
}

/**
 * Compute a member's reputation score for a community:
 *   (on-time repayments / total loans) * 100, rounded to 2 decimals.
 *
 * A loan counts as repaid on time when its status is 'repaid' and it was
 * closed on or before its due date, or when it has a repayment recorded in
 * `loan_repayments` made on or before the loan's due date. Loans that are
 * overdue/defaulted count toward `defaults`. With no loans the score defaults
 * to the neutral 50 used by the schema.
 *
 * The result is upserted into `reputation_scores`.
 */
export async function calculateReputationScore(
  client: QueryClient,
  communityId: string,
  address: string
): Promise<ReputationCalculation> {
  const [counts] = await client.query<{
    total_loans: number;
    on_time_repayments: number;
    defaults: number;
  }>(
    `SELECT
       COUNT(*)::int AS total_loans,
       COUNT(*) FILTER (
         WHERE (l.status = 'repaid' AND l.closed_at IS NOT NULL AND l.closed_at <= l.due_at)
            OR EXISTS (
              SELECT 1 FROM loan_repayments r
              WHERE r.loan_id = l.id AND r.paid_at <= l.due_at
            )
       )::int AS on_time_repayments,
       COUNT(*) FILTER (
         WHERE l.status = 'defaulted'
            OR (l.due_at IS NOT NULL AND l.due_at < NOW() AND l.status <> 'repaid')
       )::int AS defaults
     FROM loans l
     WHERE l.borrower_address = $1 AND l.community_id = $2`,
    [address, communityId]
  );

  const totalLoans = Number(counts?.total_loans ?? 0);
  const onTimeRepayments = Number(counts?.on_time_repayments ?? 0);
  const defaults = Number(counts?.defaults ?? 0);

  const score =
    totalLoans === 0
      ? NEUTRAL_SCORE
      : Math.round((onTimeRepayments / totalLoans) * 100 * 100) / 100;

  await client.query(
    `INSERT INTO reputation_scores
       (stellar_address, community_id, score, total_loans, on_time_repayments, defaults, last_calculated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (stellar_address, community_id) DO UPDATE SET
       score = EXCLUDED.score,
       total_loans = EXCLUDED.total_loans,
       on_time_repayments = EXCLUDED.on_time_repayments,
       defaults = EXCLUDED.defaults,
       last_calculated_at = NOW(),
       updated_at = NOW()`,
    [address, communityId, score, totalLoans, onTimeRepayments, defaults]
  );

  return { score, totalLoans, onTimeRepayments, defaults };
}

/**
 * GET /api/v1/reputation
 * Paginated reputation leaderboard. Highest score first by default.
 * Query: page, limit, communityId,
 *        sortBy (score|total_loans|on_time_repayments|defaults|updated_at), order (asc|desc)
 */
reputationRouter.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req);
    const { sortBy, order } = parseSort(
      req,
      ['score', 'total_loans', 'on_time_repayments', 'defaults', 'updated_at'],
      'score'
    );

    const params: unknown[] = [];
    const communityId = queryString(req.query.communityId).trim();
    const where = communityId ? `WHERE community_id = $${params.push(communityId)}` : '';

    const [{ count }] = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM reputation_scores ${where}`,
      params
    );

    const listParams = [...params, pagination.limit, pagination.offset];
    const scores = await db.query<ReputationScore>(
      `SELECT * FROM reputation_scores ${where}
       ORDER BY ${sortBy} ${order}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({ data: scores, meta: pageMeta(count, pagination) });
  } catch (err) {
    next(err);
  }
});

interface RepaymentHistoryRow {
  id: string;
  loan_id: string;
  community_id: string;
  amount: string;
  paid_at: string;
  due_at: string | null;
  on_time: boolean;
}

/**
 * GET /api/v1/reputation/:address
 * A member's reputation across every community they participate in, plus an
 * aggregate score and recent repayment history. Optionally narrowed to a
 * single community via `communityId`.
 */
reputationRouter.get(
  '/:address',
  validateParams(reputationAddressParamsSchema),
  validateQuery(reputationQuerySchema),
  async (req, res, next) => {
    try {
      const address = req.params.address;
      const communityId = queryString(req.query.communityId).trim();

      const params: unknown[] = [address];
      const communityClause = communityId ? `AND community_id = $${params.push(communityId)}` : '';

      const scores = await db.query<ReputationScore>(
        `SELECT * FROM reputation_scores
         WHERE stellar_address = $1 ${communityClause}
         ORDER BY score DESC`,
        params
      );

      const historyParams: unknown[] = [address];
      const historyCommunityClause = communityId
        ? `AND l.community_id = $${historyParams.push(communityId)}`
        : '';

      const history = await db.query<RepaymentHistoryRow>(
        `SELECT r.id,
                r.loan_id,
                l.community_id,
                r.amount,
                r.paid_at,
                l.due_at,
                (l.due_at IS NOT NULL AND r.paid_at <= l.due_at) AS on_time
         FROM loan_repayments r
         JOIN loans l ON l.id = r.loan_id
         WHERE l.borrower_address = $1 ${historyCommunityClause}
         ORDER BY r.paid_at DESC
         LIMIT 50`,
        historyParams
      );

      if (scores.length === 0 && history.length === 0) {
        res.status(404).json({ data: null, error: 'No reputation found for this address' });
        return;
      }

      // Recompute the score for the requested scope so the response is fresh.
      let score: number;
      if (communityId) {
        const calc = await calculateReputationScore(db, communityId, address);
        score = calc.score;
      } else {
        const communityIds = Array.from(
          new Set([...scores.map((s) => s.community_id), ...history.map((h) => h.community_id)])
        );
        if (communityIds.length === 0) {
          score = NEUTRAL_SCORE;
        } else {
          const calcs = await Promise.all(
            communityIds.map((id) => calculateReputationScore(db, id, address))
          );
          const totalLoans = calcs.reduce((acc, c) => acc + c.totalLoans, 0);
          const onTime = calcs.reduce((acc, c) => acc + c.onTimeRepayments, 0);
          score =
            totalLoans === 0 ? NEUTRAL_SCORE : Math.round((onTime / totalLoans) * 100 * 100) / 100;
        }
      }

      res.json({
        data: {
          address,
          score,
          communities: scores,
          history,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
