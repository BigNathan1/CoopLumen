import { Asset, Keypair } from '@stellar/stellar-sdk';
import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { StellarService } from '../../contracts/stellar';

const assetHistoryParamsSchema = z.object({
  assetCode: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9]+$/, 'Asset code must be alphanumeric'),
  issuer: z.string().refine(
    (value) => {
      try {
        Keypair.fromPublicKey(value);
        return true;
      } catch {
        return false;
      }
    },
    'Issuer must be a valid Stellar public key'
  ),
});

export const tokenHistoryRouter = Router();

tokenHistoryRouter.get(
  '/history/:assetCode/:issuer',
  (req: Request, res: Response, next: NextFunction): void => {
    const parsed = assetHistoryParamsSchema.safeParse(req.params);

    if (!parsed.success) {
      res.status(400).json({
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid token history parameters',
        },
        meta: {
          errors: parsed.error.issues,
        },
      });
      return;
    }

    const { assetCode, issuer } = parsed.data;

    StellarService.getServer()
      .operations()
      .forAsset(new Asset(assetCode, issuer))
      .limit(20)
      .order('desc')
      .call()
      .then((page) => {
        res.status(200).json({
          data: page.records,
          meta: {
            assetCode,
            issuer,
            limit: 20,
          },
        });
      })
      .catch(next);
  }
);
