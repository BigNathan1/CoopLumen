import { Router, Request, Response, NextFunction } from 'express';
import { StellarService } from '../../contracts/stellar';
import { db } from '../../db';
import { parsePagination, pageMeta } from '../utils/http';

export const balanceRouter = Router();

/**
 * GET /api/v1/balances/:publicKey
 * Returns all asset balances for a Stellar account.
 */
balanceRouter.get('/:publicKey', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { publicKey } = req.params;
    const balances = await StellarService.getAccountBalance(publicKey);
    res.json({ data: balances });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/balances/:publicKey/loans
 * Returns all loans involving a specific Stellar address.
 */
balanceRouter.get('/:publicKey/loans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { publicKey } = req.params;
    const pagination = parsePagination(req);

    const [{ count }] = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM loans WHERE borrower_address = $1 OR lender_address = $1',
      [publicKey]
    );

    const loans = await db.query<{
      id: string;
      community_id: string;
      borrower_address: string;
      lender_address: string;
      amount: string;
      asset_code: string;
      status: string;
      due_at: string | null;
      created_at: string;
    }>(
      `SELECT * FROM loans
         WHERE borrower_address = $1 OR lender_address = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
      [publicKey, pagination.limit, pagination.offset]
    );
    res.json({ data: loans, meta: pageMeta(count, pagination) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/balances/community/:communityId/loans
 * Returns all loans in a community.
 */
balanceRouter.get(
  '/community/:communityId/loans',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pagination = parsePagination(req);

      const [{ count }] = await db.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM loans WHERE community_id = $1',
        [req.params.communityId]
      );

      const loans = await db.query(
        'SELECT * FROM loans WHERE community_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [req.params.communityId, pagination.limit, pagination.offset]
      );
      res.json({ data: loans, meta: pageMeta(count, pagination) });
    } catch (err) {
      next(err);
    }
  }
);
