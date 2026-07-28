import { Router, Request, Response, NextFunction } from 'express';
import { issueAsset } from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';
import { validateBody } from '../middleware/validate';
import { issueTokenSchema, trustlineSchema } from '../schemas/token';

export const tokenRouter = Router();

/**
 * POST /api/v1/tokens/issue
 * Issues a community token on the Stellar network.
 * The issuer secret must be held server-side for this endpoint (e.g., community treasury key).
 * In production, prefer the client-sign flow (/api/tokens/build-issue).
 */
tokenRouter.post(
  '/issue',
  validateBody(issueTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { issuerSecret, assetCode, distributorPublicKey, amount, memo } = req.body as {
        issuerSecret: string;
        assetCode: string;
        distributorPublicKey: string;
        amount: string;
        memo?: string;
      };

      const txHash = await issueAsset({
        issuerSecret,
        assetCode,
        distributorPublicKey,
        amount,
        memo,
      });

      res.status(201).json({ txHash });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/tokens/trustline
 * Establishes a trustline so a member account can hold a community token.
 */
tokenRouter.post(
  '/trustline',
  validateBody(trustlineSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { accountSecret, assetCode, assetIssuer, limit } = req.body as {
        accountSecret: string;
        assetCode: string;
        assetIssuer: string;
        limit?: string;
      };

      const txHash = await establishTrustline({
        accountSecret,
        assetCode,
        assetIssuer,
        limit,
      });

      res.status(201).json({ txHash });
    } catch (err) {
      next(err);
    }
  }
);
