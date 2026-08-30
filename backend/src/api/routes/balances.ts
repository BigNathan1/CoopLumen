import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StellarService } from '../../contracts/stellar';
import { db } from '../../db';
import { parsePagination, pageMeta } from '../utils/http';
import { isValidStellarPublicKey } from '../utils/stellar';
import { cacheBalances, getCachedBalances } from '../../cache/balances';
import { mapHorizonError } from '../utils/horizonError';
import { logger } from '../../utils/logger';

export const balanceRouter = Router();

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
 *
 * Returns all on-chain asset balances for a Stellar account.
 *
 * Successful responses are cached in Redis for up to 5 seconds (BALANCE_CACHE_TTL_SECONDS).
 * A cache hit skips the Horizon call entirely. On a cache miss the account is fetched from
 * Horizon and the result is written to cache before responding.
 *
 * Horizon 429 and 503 errors are retried with exponential backoff (up to 4 attempts).
 * All other Horizon errors are mapped to actionable HTTP responses via mapHorizonError.
 *
 * @route   GET /api/v1/balances/:publicKey
 * @param   {string} req.params.publicKey - 56-character Stellar ed25519 public key (StrKey G...)
 * @returns {200} BalanceResponse - Array of balance lines (native XLM + any custom assets)
 * @returns {400} ValidationErrorResponse - publicKey failed Stellar key validation
 * @returns {404} ErrorResponse - Account does not exist on the configured Stellar network
 * @returns {502} ErrorResponse - Horizon is temporarily unavailable after retry exhaustion
 * @see     {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/retrieve-an-account} Horizon account endpoint
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
 *
 * Returns a paginated, newest-first list of balance-related audit entries from the
 * transactions_log table for a given Stellar address.
 *
 * Each entry records an action (e.g. payment_sent, token_issued, loan_repayment) along
 * with optional metadata specific to that action (amount, asset_code, loan_id, etc.).
 *
 * Database errors are caught, logged via the logger, and returned as a sanitised 500
 * response — raw error details are never surfaced to the caller.
 *
 * @route   GET /api/v1/balances/:publicKey/history
 * @param   {string}  req.params.publicKey - 56-character Stellar ed25519 public key
 * @param   {number}  [req.query.page=1]   - 1-based page number
 * @param   {number}  [req.query.limit=20] - Entries per page (1–100)
 * @returns {200} BalanceHistoryResponse - Paginated { data: BalanceHistoryEntry[], meta: PageMeta }
 * @returns {400} ValidationErrorResponse - publicKey or pagination params failed validation
 * @returns {500} ErrorResponse - Audit history could not be queried ("Failed to load balance history.")
 * @see     transactions_log table
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
 *
 * Returns a paginated list of loans where the given Stellar address appears as either
 * the borrower or the lender, ordered newest-first.
 *
 * @route   GET /api/v1/balances/:publicKey/loans
 * @param   {string}  req.params.publicKey - 56-character Stellar ed25519 public key
 * @param   {number}  [req.query.page=1]   - 1-based page number
 * @param   {number}  [req.query.limit=20] - Loans per page (1–100)
 * @returns {200} { data: Loan[], meta: PageMeta } - Paginated loan records
 * @returns {400} ValidationErrorResponse - publicKey or pagination params failed validation
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
 *
 * Returns a paginated list of all loans belonging to a community, ordered newest-first.
 *
 * @route   GET /api/v1/balances/community/:communityId/loans
 * @param   {string}  req.params.communityId - Community UUID
 * @param   {number}  [req.query.page=1]     - 1-based page number
 * @param   {number}  [req.query.limit=20]   - Loans per page (1–100)
 * @returns {200} { data: Loan[], meta: PageMeta } - Paginated loan records for the community
 * @returns {400} ValidationErrorResponse - communityId failed UUID validation or pagination params invalid
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
