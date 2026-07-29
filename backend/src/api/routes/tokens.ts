import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StrKey } from '@stellar/stellar-sdk';
import { db } from '../../db';
import { issueAsset } from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';

const router = Router();

const tokenParamsSchema = z.object({
  assetCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,12}$/, 'Asset code must be 1-12 alphanumeric characters'),
  issuer: z.string().refine((value) => StrKey.isValidEd25519PublicKey(value), {
    message: 'Issuer must be a valid Stellar public key',
  }),
});

const issueSchema = z.object({
  issuerSecret: z.string().min(1),
  assetCode: z.string().trim().regex(/^[A-Za-z0-9]{1,12}$/),
  distributorPublicKey: z.string().refine((value) => StrKey.isValidEd25519PublicKey(value)),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  memo: z.string().optional(),
});

const trustlineSchema = z.object({
  accountSecret: z.string().min(1),
  assetCode: z.string().trim().regex(/^[A-Za-z0-9]{1,12}$/),
  assetIssuer: z.string().refine((value) => StrKey.isValidEd25519PublicKey(value)),
  limit: z.string().optional(),
});

interface TokenMetadata {
  id?: string;
  asset_code: string;
  asset_issuer: string;
  name?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

function validationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    data: null,
    meta: { errors: error.flatten().fieldErrors },
    error: 'Validation failed',
  });
}

router.post('/issue', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }

  try {
    const txHash = await issueAsset(parsed.data);
    res.status(201).json({ data: { txHash } });
  } catch (error) {
    next(error);
  }
});

router.post('/trustline', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const parsed = trustlineSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }

  try {
    const txHash = await establishTrustline(parsed.data);
    res.status(201).json({ data: { txHash } });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:assetCode/:issuer',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = tokenParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      validationError(res, parsed.error);
      return;
    }

    try {
      const { rows } = await db.query<TokenMetadata>(
        `SELECT *
         FROM communities
         WHERE asset_code = $1
           AND asset_issuer = $2
         LIMIT 1`,
        [parsed.data.assetCode, parsed.data.issuer]
      );

      if (rows.length === 0) {
        res.status(404).json({ data: null, error: 'Token not found' });
        return;
      }

      res.status(200).json({ data: rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
