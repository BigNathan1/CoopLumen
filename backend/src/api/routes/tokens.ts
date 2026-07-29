import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Keypair } from '@stellar/stellar-sdk';
import { db } from '../../db';
import { burnAsset, issueAsset } from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';
import { StellarService } from '../../contracts/stellar';

const router = Router();

const stellarPublicKey = z.string().refine((value) => {
  try {
    Keypair.fromPublicKey(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid Stellar public key');

const assetCode = z
  .string()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z0-9]+$/, 'Asset code must contain only letters and numbers');

const tokenParamsSchema = z.object({
  assetCode,
  issuer: stellarPublicKey,
});

const issueSchema = z.object({
  issuerSecret: z.string().min(1),
  assetCode,
  distributorPublicKey: stellarPublicKey,
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Amount must be a valid decimal string'),
  memo: z.string().max(28).optional(),
});

const trustlineSchema = z.object({
  accountSecret: z.string().min(1),
  assetCode,
  assetIssuer: stellarPublicKey,
  limit: z.string().regex(/^\d+(\.\d{1,7})?$/).optional(),
});

const burnSchema = z.object({
  holderSecret: z.string().min(1),
  assetCode,
  assetIssuer: stellarPublicKey,
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Amount must be a valid decimal string'),
});

function validationError(res: Response, result: z.SafeParseError<unknown>): Response {
  const errors = result.error.flatten();
  return res.status(400).json({
    error: 'Validation failed',
    meta: { errors },
  });
}

router.get('/:assetCode/:issuer', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = tokenParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    validationError(res, parsed);
    return;
  }

  try {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT *
       FROM tokens
       WHERE asset_code = $1 AND asset_issuer = $2
       LIMIT 1`,
      [parsed.data.assetCode, parsed.data.issuer]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    res.status(200).json({ data: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/:communityId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM tokens WHERE community_id = $1 ORDER BY created_at DESC`,
      [req.params.communityId]
    );
    res.status(200).json({ data: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/issue', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed);
    return;
  }

  try {
    const txHash = await issueAsset(parsed.data);
    res.status(201).json({ data: { txHash }, txHash });
  } catch (error) {
    next(error);
  }
});

router.post('/trustline', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = trustlineSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed);
    return;
  }

  try {
    const txHash = await establishTrustline(parsed.data);
    res.status(201).json({ data: { txHash }, txHash });
  } catch (error) {
    next(error);
  }
});

router.post('/burn', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = burnSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed);
    return;
  }

  try {
    const txHash = await burnAsset(parsed.data);
    res.status(200).json({ data: { txHash } });
  } catch (error) {
    next(error);
  }
});

router.get('/holders/:assetCode/:issuer', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = tokenParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    validationError(res, parsed);
    return;
  }

  try {
    const result = await StellarService.getServer()
      .assets()
      .forCode(parsed.data.assetCode)
      .forIssuer(parsed.data.issuer)
      .call();

    res.status(200).json({ data: result.records });
  } catch (error) {
    next(error);
  }
});

export { router as tokensRouter };
export default router;
