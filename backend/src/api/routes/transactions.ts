import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StellarService } from '../../contracts/stellar';
import { validate } from '../middleware/validate';
import { mapHorizonError } from '../utils/horizonError';
import { db } from '../../db';

export const transactionsRouter = Router();

const communityIdParamSchema = z.object({
  communityId: z.string().uuid('Invalid community ID'),
});

/**
 * @route GET /api/v1/transactions/export/:communityId
 * @desc Export transaction history for a community as a CSV
 * @access Public
 */
transactionsRouter.get(
  '/export/:communityId',
  validate({ params: communityIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { communityId } = req.params;

      const communityResult = await db.query(
        'SELECT issuer_public_key FROM communities WHERE id = $1 AND deleted_at IS NULL',
        [communityId]
      );

      if (communityResult.rows.length === 0) {
        res.status(404).json({
          data: null,
          error: 'Community not found',
        });
        return;
      }

      const issuerPublicKey = communityResult.rows[0].issuer_public_key;

      let txRecords;
      try {
        txRecords = await StellarService.getTransactionHistory(issuerPublicKey, 200);
      } catch (err) {
        const mapped = mapHorizonError(err);
        res.status(mapped.status).json({
          data: null,
          error: mapped.message,
        });
        return;
      }

      const csvRows = [
        'id,created_at,source_account,fee_charged,successful,memo'
      ];

      for (const tx of txRecords) {
        const id = JSON.stringify(tx.id);
        const createdAt = JSON.stringify(tx.created_at);
        const sourceAccount = JSON.stringify(tx.source_account);
        const feeCharged = JSON.stringify(tx.fee_charged);
        const successful = JSON.stringify(tx.successful);
        const memoVal = tx.memo_type !== 'none' ? String(tx.memo ?? '') : '';
        const memo = JSON.stringify(memoVal);

        csvRows.push(`${id},${createdAt},${sourceAccount},${feeCharged},${successful},${memo}`);
      }

      const csvContent = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="transactions-${communityId}.csv"`);
      res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  }
);
