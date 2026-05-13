import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { issueAsset } from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';

export const tokenRouter = Router();

const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
};

/**
 * POST /api/tokens/issue
 * Issues a community token on the Stellar network.
 * The issuer secret must be held server-side for this endpoint (e.g., community treasury key).
 * In production, prefer the client-sign flow (/api/tokens/build-issue).
 */
tokenRouter.post(
  '/issue',
  [
    body('issuerSecret').isString().trim().isLength({ min: 56 }),
    body('assetCode').isString().trim().isLength({ min: 1, max: 12 }),
    body('distributorPublicKey').isString().trim().isLength({ min: 56, max: 56 }),
    body('amount').isString().matches(/^\d+(\.\d{1,7})?$/),
    body('memo').optional().isString().trim().isLength({ max: 28 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { issuerSecret, assetCode, distributorPublicKey, amount, memo } =
        req.body as {
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
 * POST /api/tokens/trustline
 * Establishes a trustline so a member account can hold a community token.
 */
tokenRouter.post(
  '/trustline',
  [
    body('accountSecret').isString().trim().isLength({ min: 56 }),
    body('assetCode').isString().trim().isLength({ min: 1, max: 12 }),
    body('assetIssuer').isString().trim().isLength({ min: 56, max: 56 }),
    body('limit').optional().isString().matches(/^\d+(\.\d{1,7})?$/),
  ],
  validate,
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
