import { Router, Request, Response, NextFunction } from 'express';
import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';
import {
  burnAsset,
  getAssetHolders,
  getAssetSupply,
  issueAsset,
} from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';

const router = Router();

const assetCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{1,12}$/, 'assetCode must be 1-12 alphanumeric characters');
const publicKeySchema = z
  .string()
  .refine((value) => StrKey.isValidEd25519PublicKey(value), 'must be a valid Stellar public key');
const amountSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/, 'amount must be a valid decimal string');

const assetParamsSchema = z.object({
  assetCode: assetCodeSchema,
  issuer: publicKeySchema,
});

const issueBodySchema = z.object({
  issuerSecret: z.string().min(1),
  assetCode: assetCodeSchema,
  distributorPublicKey: publicKeySchema,
  amount: amountSchema,
  memo: z.string().optional(),
});

const burnBodySchema = z.object({
  holderSecret: z.string().min(1),
  assetCode: assetCodeSchema,
  assetIssuer: publicKeySchema,
  amount: amountSchema,
});

const trustlineBodySchema = z.object({
  accountSecret: z.string().min(1),
  assetCode: assetCodeSchema,
  assetIssuer: publicKeySchema,
  limit: amountSchema.optional(),
});

function validationError(res: Response, error: z.ZodError): void {
  const errors = error.flatten().fieldErrors;
  res.status(400).json({
    error: 'Invalid request parameters',
    errors,
    meta: { errors },
  });
}

function horizonError(error: unknown): { status: number; message: string } {
  const candidate = error as {
    response?: { status?: number; data?: { title?: string; detail?: string } };
    status?: number;
  };
  const status = candidate.response?.status ?? candidate.status;

  if (status === 404) {
    return { status: 404, message: 'The requested Stellar asset was not found on Horizon' };
  }
  if (status === 429) {
    return {
      status: 503,
      message: 'Stellar Horizon is rate limiting requests; please try again shortly',
    };
  }
  if (typeof status === 'number' && status >= 500) {
    return { status: 502, message: 'Stellar Horizon is temporarily unavailable; please try again' };
  }
  return { status: 502, message: 'Unable to query Stellar Horizon for the token supply' };
}

router.get(
  '/supply/:assetCode/:issuer',
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = assetParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      validationError(res, parsed.error);
      return;
    }

    try {
      const supply = await getAssetSupply(parsed.data.assetCode, parsed.data.issuer);
      res.json({
        data: {
          assetCode: parsed.data.assetCode,
          issuer: parsed.data.issuer,
          supply,
        },
      });
    } catch (error) {
      const mapped = horizonError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  }
);

router.get(
  '/holders/:assetCode/:issuer',
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = assetParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      validationError(res, parsed.error);
      return;
    }

    try {
      const holders = await getAssetHolders(parsed.data.assetCode, parsed.data.issuer);
      res.json({ data: holders });
    } catch (error) {
      const mapped = horizonError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  }
);

router.post('/issue', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = issueBodySchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }

  try {
    const result = await issueAsset(parsed.data);
    res.status(201).json({ data: { txHash: result }, txHash: result });
  } catch (error) {
    next(error);
  }
});

router.post('/burn', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = burnBodySchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }

  try {
    const result = await burnAsset(parsed.data);
    res.status(201).json({ data: { txHash: result }, txHash: result });
  } catch (error) {
    next(error);
  }
});

router.post('/trustline', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = trustlineBodySchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }

  try {
    const result = await establishTrustline(parsed.data);
    res.status(201).json({ data: { txHash: result }, txHash: result });
  } catch (error) {
    next(error);
  }
});

export { router as tokensRouter };
export default router;
