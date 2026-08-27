import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StellarService } from '../../contracts/stellar';
import { db } from '../../db';
import { parsePagination, pageMeta } from '../utils/http';
import { isValidStellarPublicKey } from '../utils/stellar';
import { cacheBalances, getCachedBalances } from '../../cache/balances';
import { mapHorizonError } from '../utils/horizonError';
import { logger } from '../../utils/logger';

export const balanceRouter: Router = Router();

interface BalanceHistoryEntry {
  id: string;
  community_id: string | null;
  actor_address: string | null;
  action: string;
  stellar_tx_hash: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const balanceParamsSchema = z.object({
  publicKey: z
    .string()
    .refine(isValidStellarPublicKey, 'publicKey must be a valid Stellar public key'),
});

const communityBalanceParamsSchema = z.object({
  communityId: z.string().uuid('communityId must be a valid UUID'),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

function respondValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    data: null,
    error: 'Validation failed',
    meta: {
      errors: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  });
}

/**
 * GET /api/v1/balances/:publicKey
 * Returns all asset balances for a Stellar account.
 */
balanceRouter.get('/:publicKey', async (req: Request, res: Response, next: NextFunction) => {
  const parsedParams = balanceParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    respondValidationError(res, parsedParams.error);
    return;
  }

  try {
    const { publicKey } = parsedParams.data;
    const cachedBalances = await getCachedBalances(publicKey);
    if (cachedBalances) {
      res.json({ data: cachedBalances });
      return;
    }

    const balances = await StellarService.getAccountBalance(publicKey);
    if (!Array.isArray(balances)) {
      res.status(502).json({
        data: null,
        error: 'Received an invalid balance response from the Stellar network.',
      });
      return;
    }

    await cacheBalances(publicKey, balances);
    res.json({ data: balances });
  } catch (err) {
    if ((err as { response?: unknown }).response) {
      const mapped = mapHorizonError(err);
      res.status(mapped.status).json({ data: null, error: mapped.message });
      return;
    }

    next(err);
  }
});

/**
 * GET /api/v1/balances/:publicKey/history
 * Returns newest-first balance-related audit history for a Stellar address.
 */
balanceRouter.get('/:publicKey/history', async (req: Request, res: Response) => {
  const parsedParams = balanceParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    respondValidationError(res, parsedParams.error);
    return;
  }

  const parsedQuery = paginationQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    respondValidationError(res, parsedQuery.error);
    return;
  }

  try {
    const { publicKey } = parsedParams.data;
    const pagination = parsePagination(req);

    const [{ count }] = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM transactions_log WHERE actor_address = $1',
      [publicKey]
    );
    const history = await db.query<BalanceHistoryEntry>(
      `SELECT id, community_id, actor_address, action, stellar_tx_hash, metadata, created_at
         FROM transactions_log
        WHERE actor_address = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [publicKey, pagination.limit, pagination.offset]
    );

    res.json({ data: history, meta: pageMeta(count, pagination) });
  } catch (err) {
    logger.error('Failed to query balance history', {
      publicKey: parsedParams.data.publicKey,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ data: null, error: 'Failed to load balance history.' });
  }
});

/**
 * GET /api/v1/balances/:publicKey/loans
 * Returns all loans involving a specific Stellar address.
 */
balanceRouter.get('/:publicKey/loans', async (req: Request, res: Response, next: NextFunction) => {
  const parsedParams = balanceParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    respondValidationError(res, parsedParams.error);
    return;
  }

  const parsedQuery = paginationQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    respondValidationError(res, parsedQuery.error);
    return;
  }

  try {
    const { publicKey } = parsedParams.data;
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
    const parsedParams = communityBalanceParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      respondValidationError(res, parsedParams.error);
      return;
    }

    const parsedQuery = paginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      respondValidationError(res, parsedQuery.error);
      return;
    }

    try {
      const pagination = parsePagination(req);

      const [{ count }] = await db.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM loans WHERE community_id = $1',
        [parsedParams.data.communityId]
      );

      const loans = await db.query(
        'SELECT * FROM loans WHERE community_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [parsedParams.data.communityId, pagination.limit, pagination.offset]
      );
      res.json({ data: loans, meta: pageMeta(count, pagination) });
    } catch (err) {
      next(err);
    }
  }
);
