import { Router, Request, Response, NextFunction } from 'express';
import { StellarService } from '../../contracts/stellar';
import { accountParamsSchema } from '../schemas/account';
import { mapHorizonError } from '../utils/horizonError';
import { formatAccountDetails } from '../utils/stellarAccount';

export const accountsRouter = Router();

/**
 * GET /api/v1/accounts/:publicKey
 * Returns full Stellar account details from Horizon for the given public key.
 */
accountsRouter.get(
  '/:publicKey',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsedParams = accountParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: parsedParams.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }

    try {
      const { publicKey } = parsedParams.data;
      const account = await StellarService.loadAccount(publicKey);
      const accountDetails = formatAccountDetails(account);

      res.status(200).json({ data: accountDetails });
    } catch (err) {
      if ((err as { response?: unknown }).response) {
        const mapped = mapHorizonError(err);
        res.status(mapped.status).json({ data: null, error: mapped.message });
        return;
      }

      next(err);
    }
  }
);

/**
 * GET /api/v1/accounts/:publicKey/trustlines
 *
 * Returns all established trustlines for a Stellar account.
 *
 * Fetches the account from Horizon via StellarService.loadAccount() and
 * filters the balance lines to non-native assets. Each trustline entry
 * includes asset_code, asset_issuer, balance, limit, is_authorized,
 * is_authorized_to_maintain_liabilities, buying_liabilities,
 * selling_liabilities, and last_modified_ledger.
 *
 * Horizon 429/503 errors are retried with exponential backoff (up to 4
 * attempts) by StellarService before the error is propagated.
 *
 * @route   GET /api/v1/accounts/:publicKey/trustlines
 * @param   {string} req.params.publicKey - 56-character Stellar ed25519 public key
 * @returns {200} { data: Trustline[] } - Array of established trustlines (empty if none)
 * @returns {400} ValidationErrorResponse - publicKey failed Stellar key validation
 * @returns {404} ErrorResponse - Account does not exist on the configured network
 * @returns {502} ErrorResponse - Horizon unavailable after retry exhaustion
 */
accountsRouter.get(
  '/:publicKey/trustlines',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsedParams = accountParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: parsedParams.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }

    try {
      const { publicKey } = parsedParams.data;
      const account = await StellarService.loadAccount(publicKey);
      const trustlines = account.balances.filter((b) => b.asset_type !== 'native');
      res.json({ data: trustlines });
    } catch (err) {
      if ((err as { response?: unknown }).response) {
        const mapped = mapHorizonError(err);
        res.status(mapped.status).json({ data: null, error: mapped.message });
        return;
      }
      next(err);
    }
  }
);
