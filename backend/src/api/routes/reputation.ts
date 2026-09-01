import { Router } from 'express';
import { db } from '../../db';
import { parsePagination, pageMeta, parseSort, queryString } from '../utils/http';

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

/**
 * GET /api/v1/reputation/:address
 * A member's reputation across every community they participate in, plus an
 * aggregate summary. Optionally narrowed to a single community via `communityId`.
 */
reputationRouter.get('/:address', async (req, res, next) => {
  try {
    const params: unknown[] = [req.params.address];
    const communityId = queryString(req.query.communityId).trim();
    const communityClause = communityId ? `AND community_id = $${params.push(communityId)}` : '';

    const scores = await db.query<ReputationScore>(
      `SELECT * FROM reputation_scores
       WHERE stellar_address = $1 ${communityClause}
       ORDER BY score DESC`,
      params
    );

    if (scores.length === 0) {
      res.status(404).json({ error: 'No reputation found for this address' });
      return;
    }

    const summary = scores.reduce(
      (acc, s) => ({
        total_loans: acc.total_loans + Number(s.total_loans),
        on_time_repayments: acc.on_time_repayments + Number(s.on_time_repayments),
        defaults: acc.defaults + Number(s.defaults),
      }),
      { total_loans: 0, on_time_repayments: 0, defaults: 0 }
    );

    res.json({
      data: {
        address: req.params.address,
        communities: scores,
        summary,
      },
    });
  } catch (err) {
    next(err);
  }
});
