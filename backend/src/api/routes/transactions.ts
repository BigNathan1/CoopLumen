import { Request, Response, NextFunction, Router } from 'express';
import { z } from 'zod';
import { buildUnsignedPayment, submitSignedXdr } from '../../contracts/transactions';
import { StellarService } from '../../contracts/stellar';
import {
  unsignedPaymentSchema,
  submitTransactionSchema,
  transactionHashSchema,
  communityTransactionsQuerySchema,
} from '../schemas/transaction';
import { mapHorizonError } from '../utils/horizonError';
import { validateParams, validateQuery } from '../middleware/validate';
import { parsePagination, pageMeta } from '../utils/http';
import { db } from '../../db';

export const transactionRouter = Router();

const communityIdParamSchema = z.object({
  communityId: z.string().uuid('Invalid community ID'),
});

/**
 * POST /api/v1/transactions/unsigned
 *
 * Builds an unsigned Stellar payment transaction XDR for signing by the source account's wallet.
 *
 * Loads the source account and its current sequence number from Horizon, then constructs a
 * single-operation payment transaction. The transaction is NOT signed or submitted by this
 * endpoint — the caller's wallet must sign the returned XDR and then POST the signed
 * transaction to POST /api/v1/tokens/transfer.
 *
 * Request body fields (UnsignedPaymentRequest):
 *   - senderPublicKey       {string} required  - Source account Stellar public key
 *   - destinationPublicKey  {string} required  - Destination account Stellar public key
 *   - assetCode             {string} required  - Asset code (use "XLM" for native)
 *   - amount                {string} required  - Positive decimal amount (up to 7 decimal places)
 *   - assetIssuer           {string} optional  - Issuer public key; required for non-XLM assets
 *   - memo                  {string} optional  - Text memo, at most 28 UTF-8 bytes
 *
 * @route   POST /api/v1/transactions/unsigned
 * @returns {200} { data: { xdr: string } } - Base64-encoded unsigned transaction envelope XDR
 * @returns {400} ValidationErrorResponse   - Request body failed Zod validation
 * @returns {404} ErrorResponse             - Source account does not exist on the configured network
 * @returns {502} ErrorResponse             - Horizon is temporarily unavailable
 * @see     POST /api/v1/tokens/transfer to submit the signed transaction
 * @see     {@link https://developers.stellar.org/docs/learn/fundamentals/transactions} Stellar transactions
 */
transactionRouter.post('/unsigned', async (req: Request, res: Response): Promise<void> => {
  const parsed = unsignedPaymentSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      data: null,
      meta: {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      error: 'Validation failed',
    });
    return;
  }

  try {
    const xdr = await buildUnsignedPayment({
      ...parsed.data,
      assetIssuer: parsed.data.assetIssuer ?? '',
    });

    res.status(200).json({ data: { xdr } });
  } catch (error) {
    const mapped = mapHorizonError(error);
    res.status(mapped.status).json({ data: null, error: mapped.message });
  }
});

/**
 * POST /api/v1/transactions/submit
 *
 * Submits a signed transaction envelope (XDR) to the Stellar network. The
 * client signs the envelope returned by POST /unsigned and posts it here.
 *
 * Request body:
 *   - xdr {string} required - Base64-encoded signed transaction envelope
 *
 * @route   POST /api/v1/transactions/submit
 * @returns {200} { data: { hash: string } } - Hash of the accepted transaction
 * @returns {400} ValidationErrorResponse    - Request body failed Zod validation
 * @returns {422} ErrorResponse              - Horizon rejected the transaction
 * @returns {502} ErrorResponse              - Horizon is temporarily unavailable
 * @see     POST /api/v1/transactions/unsigned to build the envelope to sign
 */
transactionRouter.post('/submit', async (req: Request, res: Response): Promise<void> => {
  const parsed = submitTransactionSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      data: null,
      meta: {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      error: 'Validation failed',
    });
    return;
  }

  try {
    const hash = await submitSignedXdr(parsed.data.xdr);

    res.status(200).json({ data: { hash } });
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
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="transactions-${communityId}.csv"`
      );
      res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  }
);

interface TransactionLogRow {
  id: string;
  community_id: string | null;
  actor_address: string | null;
  action: string;
  stellar_tx_hash: string | null;
  metadata: unknown;
  created_at: string;
}

/**
 * GET /api/v1/transactions/history/:communityId
 *
 * Paginated audit-log history for a community, from `transactions_log`.
 * Optionally narrowed to a date range and/or a single action type.
 *
 * @route   GET /api/v1/transactions/history/:communityId
 * @returns {200} { data: TransactionLogRow[], meta: PageMeta }
 * @returns {400} ValidationErrorResponse - communityId is not a UUID, or a
 * query param is malformed (`from`/`to` not ISO 8601, `to` before `from`,
 * or `type` not one of the recognised action values)
 * @returns {404} ErrorResponse - Community does not exist
 */
transactionRouter.get(
  '/history/:communityId',
  validateParams(communityIdParamSchema),
  validateQuery(communityTransactionsQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { communityId } = req.params;
      const { from, to, type } = req.query as unknown as {
        from?: string;
        to?: string;
        type?: string;
      };

      const communityRows = await db.query<{ id: string }>(
        'SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL',
        [communityId]
      );

      if (communityRows.length === 0) {
        res.status(404).json({ data: null, error: 'Community not found' });
        return;
      }

      const pagination = parsePagination(req);
      const conditions = ['community_id = $1'];
      const values: unknown[] = [communityId];

      if (from) {
        values.push(from);
        conditions.push(`created_at >= $${values.length}`);
      }
      if (to) {
        values.push(to);
        conditions.push(`created_at <= $${values.length}`);
      }
      if (type) {
        values.push(type);
        conditions.push(`action = $${values.length}`);
      }

      const whereClause = conditions.join(' AND ');

      const [{ count }] = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM transactions_log WHERE ${whereClause}`,
        values
      );

      const rows = await db.query<TransactionLogRow>(
        `SELECT id, community_id, actor_address, action, stellar_tx_hash, metadata, created_at
         FROM transactions_log
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pagination.limit, pagination.offset]
      );

      res.status(200).json({ data: rows, meta: pageMeta(count, pagination) });
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
