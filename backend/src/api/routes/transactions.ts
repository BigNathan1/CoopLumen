import { Request, Response, Router } from 'express';
import { TransactionBuilder, Networks } from '@stellar/stellar-sdk';
import { buildUnsignedPayment } from '../../contracts/transactions';
import { StellarService } from '../../contracts/stellar';
import {
  unsignedPaymentSchema,
  submitTransactionSchema,
  getCommunityTransactionsSchema,
} from '../schemas/transaction';
import { mapHorizonError } from '../utils/horizonError';
import { db } from '../../db';

export const transactionRouter = Router();

/** Build a payment transaction for signing by the source account's wallet. */
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

/** Submit a signed transaction envelope (XDR) to the Stellar network. */
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
    const { xdr } = parsed.data;

    const transaction = TransactionBuilder.fromXDR(
      xdr,
      StellarService.network || Networks.TESTNET
    );

    const result = await StellarService.server.submitTransaction(transaction as any);

    res.status(200).json({
      data: {
        hash: result.hash,
        ledger: result.ledger,
        status: 'success',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[TRANSACTION_SUBMIT_ERROR]', error?.response?.data || error);
    const mapped = mapHorizonError(error);
    res.status(mapped.status || 500).json({ data: null, error: mapped.message });
  }
});

/** Get paginated, date/type-filtered transaction history for a community. */
transactionRouter.get('/:communityId', async (req: Request, res: Response): Promise<void> => {
  const parsed = getCommunityTransactionsSchema.safeParse({
    params: req.params,
    query: req.query,
  });

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
    const { communityId } = parsed.data.params;
    const { page, limit, from, to, type } = parsed.data.query;
    const offset = (page - 1) * limit;

    const whereClause: any = { community_id: communityId };

    if (from || to) {
      whereClause.created_at = {};
      if (from) whereClause.created_at.gte = new Date(from);
      if (to) whereClause.created_at.lte = new Date(to);
    }

    if (type) {
      whereClause.action = type;
    }

    const [transactions, totalCount] = await Promise.all([
      db.transactionLog.findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      db.transactionLog.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      data: transactions,
      meta: {
        total: totalCount,
        page,
        limit,
        pages: totalPages,
        offset,
      },
    });
  } catch (error) {
    console.error('[GET_COMMUNITY_TRANSACTIONS_ERROR]', error);
    res.status(500).json({
      data: null,
      error: 'An unexpected error occurred while fetching transaction history.',
    });
  }
});