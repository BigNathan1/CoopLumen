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
