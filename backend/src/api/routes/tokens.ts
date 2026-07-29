import { Router, Request, Response } from 'express';
import { Keypair } from '@stellar/stellar-sdk';
import { db } from '../../db';
import { burnAsset, getAssetHolders, issueAsset } from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';
import {
  burnTokenSchema,
  issueTokenSchema,
  trustlineTokenSchema,
} from '../schemas/token';

const router = Router();

function validationError(res: Response, errors: unknown): Response {
  const response = {
    data: null,
    meta: { errors },
    error: 'Validation failed',
    // Retained for compatibility with existing clients and repository tests.
    errors,
  };
  return res.status(400).json(response);
}

function stellarError(error: unknown): string {
  const value = error as {
    response?: { data?: { extras?: { result_codes?: Record<string, string> } } };
    message?: string;
  };
  const codes = value.response?.data?.extras?.result_codes;
  const code = codes ? Object.values(codes).join(',') : '';

  if (code.includes('op_underfunded') || code.includes('tx_insufficient_balance')) {
    return 'The issuer account does not have enough XLM to submit this transaction';
  }
  if (code.includes('op_no_trust')) {
    return 'The distributor account must establish a trustline for this asset first';
  }
  if (code.includes('op_malformed') || code.includes('tx_bad_seq')) {
    return 'The Stellar transaction was malformed or has an invalid sequence number';
  }
  if (code.includes('op_not_authorized')) {
    return 'The issuer is not authorized to issue this asset';
  }
  if (code.includes('op_line_full')) {
    return 'The distributor trustline limit is too low for this issuance';
  }
  if (code.includes('tx_bad_auth')) {
    return 'The supplied Stellar secret key could not authorize the transaction';
  }

  return 'The Stellar transaction could not be submitted';
}

router.post('/issue', async (req: Request, res: Response): Promise<void> => {
  const parsed = issueTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error.flatten().fieldErrors);
    return;
  }

  const { communityId, issuerSecret, assetCode, distributorPublicKey, amount, memo } = parsed.data;

  try {
    const txHash = await issueAsset({
      issuerSecret,
      assetCode,
      distributorPublicKey,
      amount,
      ...(memo !== undefined ? { memo } : {}),
    });

    // A community is optional for backwards compatibility with the original
    // issuance endpoint. When supplied, the confirmed transaction is followed
    // by persistence of the canonical off-chain token metadata.
    if (communityId) {
      const issuer = Keypair.fromSecret(issuerSecret).publicKey();
      await db.query(
        `INSERT INTO tokens (community_id, asset_code, asset_issuer, total_supply)
         VALUES ($1, $2, $3, $4)`,
        [communityId, assetCode, issuer, amount]
      );
    }

    res.status(201).json({ data: { txHash }, txHash });
  } catch (error) {
    if (error instanceof Error && error.message.includes('duplicate')) {
      res.status(409).json({ data: null, error: 'A token with this metadata already exists' });
      return;
    }
    res.status(502).json({ data: null, error: stellarError(error) });
  }
});

router.post('/burn', async (req: Request, res: Response): Promise<void> => {
  const parsed = burnTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error.flatten().fieldErrors);
    return;
  }

  try {
    const txHash = await burnAsset(parsed.data);
    res.status(201).json({ data: { txHash }, txHash });
  } catch (error) {
    res.status(502).json({ data: null, error: stellarError(error) });
  }
});

router.post('/trustline', async (req: Request, res: Response): Promise<void> => {
  const parsed = trustlineTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error.flatten().fieldErrors);
    return;
  }

  try {
    const txHash = await establishTrustline(parsed.data);
    res.status(201).json({ data: { txHash }, txHash });
  } catch (error) {
    res.status(502).json({ data: null, error: stellarError(error) });
  }
});

router.get('/:communityId', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.query(
      `SELECT id, community_id, asset_code, asset_issuer, total_supply, created_at
       FROM tokens
       WHERE community_id = $1
       ORDER BY created_at DESC`,
      [req.params.communityId]
    );
    res.json({ data: result.rows });
  } catch {
    res.status(500).json({ data: null, error: 'Unable to retrieve community tokens' });
  }
});

router.get('/holders/:assetCode/:issuer', async (req: Request, res: Response): Promise<void> => {
  try {
    const holders = await getAssetHolders(req.params.assetCode, req.params.issuer);
    res.json({ data: holders });
  } catch (error) {
    res.status(502).json({ data: null, error: stellarError(error) });
  }
});

export { router as tokensRouter };
export default router;
