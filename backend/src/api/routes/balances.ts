import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { StellarService } from '../../contracts/stellar';
import { db } from '../../db';

export const balanceRouter = Router();

/**
 * GET /api/v1/balances/:publicKey
 * Returns all asset balances for a Stellar account.
 */
balanceRouter.get(
  '/:publicKey',
  [query('publicKey').optional()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { publicKey } = req.params;
      const balances = await StellarService.getAccountBalance(publicKey);
      res.json({ data: balances });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/balances/:publicKey/loans
 * Returns all loans involving a specific Stellar address.
 */
balanceRouter.get('/:publicKey/loans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { publicKey } = req.params;
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
         ORDER BY created_at DESC`,
      [publicKey]
    );
    res.json({ data: loans });
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
      const loans = await db.query(
        'SELECT * FROM loans WHERE community_id = $1 ORDER BY created_at DESC',
        [req.params.communityId]
      );
      res.json({ data: loans });
    } catch (err) {
      next(err);
    }
  }
);
