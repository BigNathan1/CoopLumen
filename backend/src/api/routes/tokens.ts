import { Router, Request, Response, NextFunction } from 'express';
import { issueAsset, burnAsset, getAssetHolders } from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';
import { validateBody } from '../middleware/validate';
import { idempotent } from '../middleware/idempotency';
import { issueTokenSchema, trustlineSchema, burnTokenSchema } from '../schemas/token';
import { isValidStellarPublicKey } from '../utils/stellar';
import { mapHorizonError } from '../utils/horizonError';
import { db } from '../../db';

export const tokenRouter = Router();

interface Token {
  id: string;
  community_id: string;
  asset_code: string;
  asset_issuer: string;
  distributor_address: string;
  total_supply: string;
  description: string | null;
  icon_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * POST /api/v1/tokens/issue
 * Issues a community token on the Stellar network.
 * The issuer secret must be held server-side for this endpoint (e.g., community treasury key).
 * In production, prefer the client-sign flow (/api/tokens/build-issue).
 * Accepts an optional Idempotency-Key header; a retried request with the same
 * key replays the original response instead of issuing a second time.
 */
tokenRouter.post(
  '/issue',
  idempotent('POST /api/v1/tokens/issue'),
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

      res.status(201).json({ data: { txHash } });
    } catch (err) {
      if ((err as { response?: unknown }).response) {
        const mapped = mapHorizonError(err);
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }
      next(err);
    }
  }
);

/**
 * POST /api/v1/tokens/burn
 * Reduces circulating supply by sending tokens from a holder back to the
 * issuing account, where they cease to count toward circulation.
 */
tokenRouter.post(
  '/burn',
  validateBody(burnTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { holderSecret, assetCode, assetIssuer, amount } = req.body as {
        holderSecret: string;
        assetCode: string;
        assetIssuer: string;
        amount: string;
      };

      const txHash = await burnAsset({ holderSecret, assetCode, assetIssuer, amount });

      await db.query(
        `UPDATE tokens SET total_supply = total_supply - $1
         WHERE asset_code = $2 AND asset_issuer = $3`,
        [amount, assetCode, assetIssuer]
      );

      res.status(200).json({ data: { txHash } });
    } catch (err) {
      if ((err as { response?: unknown }).response) {
        const mapped = mapHorizonError(err);
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }
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

      res.status(201).json({ data: { txHash } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/tokens/:communityId
 * Lists all tokens issued for a community.
 */
tokenRouter.get('/:communityId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens = await db.query<Token>(
      'SELECT * FROM tokens WHERE community_id = $1 ORDER BY created_at',
      [req.params.communityId]
    );
    res.json({ data: tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/tokens/holders/:assetCode/:issuer
 * Lists accounts holding a given asset by querying Horizon.
 */
tokenRouter.get(
  '/holders/:assetCode/:issuer',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assetCode, issuer } = req.params;
      if (!isValidStellarPublicKey(issuer)) {
        res.status(400).json({ error: 'Invalid Stellar issuer address' });
        return;
      }

      const holders = await getAssetHolders(assetCode, issuer);
      res.json({ data: holders });
    } catch (err) {
      if ((err as { response?: unknown }).response) {
        const mapped = mapHorizonError(err);
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }
      next(err);
    }
  }
);
