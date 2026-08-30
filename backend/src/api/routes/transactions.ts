import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StellarService } from '../../contracts/stellar';
import { validate } from '../middleware/validate';
import { mapHorizonError } from '../utils/horizonError';
import { db } from '../../db';

export const transactionsRouter = Router();
import { Request, Response, NextFunction, Router } from 'express';
import { z } from 'zod';
import { buildUnsignedPayment } from '../../contracts/transactions';
import { StellarService } from '../../contracts/stellar';
import { unsignedPaymentSchema, transactionHashSchema } from '../schemas/transaction';
import { mapHorizonError } from '../utils/horizonError';
import { validateParams } from '../middleware/validate';
import { db } from '../../db';

export const transactionRouter: Router = Router();

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
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const xdr = await buildUnsignedPayment({
      ...parsed.data,
      assetIssuer: parsed.data.assetIssuer ?? '',
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    res.status(200).json({ data: { xdr } });
  } catch (error) {
    const mapped = mapHorizonError(error);
    res.status(mapped.status).json({ data: null, error: mapped.message });
  }
});

/**
 * GET /api/v1/transactions/export/:communityId
 *
 * Exports a community's Stellar transaction history (from its issuer account) as a
 * downloadable CSV file.
 *
 * @route   GET /api/v1/transactions/export/:communityId
 * @returns {200} text/csv attachment with columns: id,created_at,source_account,fee_charged,successful,memo
 * @returns {400} ValidationErrorResponse - communityId is not a valid UUID
 * @returns {404} ErrorResponse           - Community does not exist
 * @returns {502} ErrorResponse           - Horizon is temporarily unavailable
 */
transactionRouter.get(
  '/export/:communityId',
  validateParams(communityIdParamSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { communityId } = req.params;

      const communityRows = await db.query<{ issuer_public_key: string }>(
        'SELECT issuer_public_key FROM communities WHERE id = $1 AND deleted_at IS NULL',
        [communityId]
      );

      if (communityRows.length === 0) {
        res.status(404).json({
          data: null,
          error: 'Community not found',
        });
        return;
      }

      const issuerPublicKey = communityRows[0].issuer_public_key;

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

      const csvRows = ['id,created_at,source_account,fee_charged,successful,memo'];

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

/**
 * GET /api/v1/transactions/:hash
 *
 * Looks up a submitted transaction's full record on Horizon by its hash.
 *
 * @route   GET /api/v1/transactions/:hash
 * @returns {200} { data: TransactionRecord } - The Horizon transaction record
 * @returns {400} ValidationErrorResponse     - hash is not a 64-character hex string
 * @returns {404} ErrorResponse               - No transaction with that hash exists
 * @returns {502} ErrorResponse               - Horizon is temporarily unavailable
 */
transactionRouter.get(
  '/:hash',
  validateParams(transactionHashSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { hash } = req.params;
      const transaction = await StellarService.getTransaction(hash);
      res.status(200).json({ data: transaction });
    } catch (error) {
      const mapped = mapHorizonError(error);
      res.status(mapped.status).json({ data: null, error: mapped.message });
    }
  }
);
