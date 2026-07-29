import { Keypair } from '@stellar/stellar-sdk';
import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { StellarService } from '../../contracts/stellar';

const assetHistoryParamsSchema = z.object({
  assetCode: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9]+$/, 'Asset code must be alphanumeric'),
  issuer: z.string().refine((value) => {
    try {
      Keypair.fromPublicKey(value);
      return true;
    } catch {
      return false;
    }
  }, 'Issuer must be a valid Stellar public key'),
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

    // Horizon has no "operations/payments for an asset" endpoint; the issuer
    // account is the canonical source of an asset's activity, so its payment
    // history filtered to this asset is the closest available proxy.
    StellarService.getServer()
      .payments()
      .forAccount(issuer)
      .limit(20)
      .order('desc')
      .call()
      .then((page) => {
        const records = page.records.filter(
          (record) =>
            'asset_code' in record &&
            record.asset_code === assetCode &&
            'asset_issuer' in record &&
            record.asset_issuer === issuer
        );

        res.status(200).json({
          data: records,
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
