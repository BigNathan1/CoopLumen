import { Router, Request, Response } from 'express';
import { Keypair } from '@stellar/stellar-sdk';
import { burnAsset, issueAsset } from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';
import { db } from '../../db';
import {
  burnTokenSchema,
  issueTokenSchema,
  trustlineTokenSchema,
} from '../schemas/token';

const router = Router();

type ValidationIssue = {
  path: (string | number)[];
  message: string;
};

function validationError(res: Response, error: { issues: ValidationIssue[] }): void {
  const errors = error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));

  res.status(400).json({
    data: null,
    meta: { errors },
    // Retained for compatibility with existing clients and tests. New clients
    // should consume meta.errors according to the API envelope.
    errors,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
    },
  });
}

function stellarError(error: unknown): { code: string; message: string } {
  const candidate = error as {
    response?: { data?: { extras?: { result_codes?: Record<string, string> } } };
    message?: string;
  };
  const codes = candidate.response?.data?.extras?.result_codes ?? {};
  const resultCode = Object.values(codes)[0] ?? '';

  const messages: Record<string, string> = {
    op_no_source_account: 'The issuer account could not be used as the transaction source.',
    op_underfunded: 'The issuer account does not have enough XLM to pay the transaction fee.',
    op_no_destination: 'The distributor account does not exist on the Stellar network.',
    op_no_trust: 'The distributor must establish a trustline for this asset before issuance.',
    op_line_full: 'The distributor trustline limit is too low for the requested amount.',
    op_malformed: 'The Stellar payment was rejected because its parameters are invalid.',
    tx_bad_seq: 'The issuer account sequence is stale; please retry the request.',
    tx_insufficient_fee: 'The transaction fee is too low for the current network conditions.',
    tx_bad_auth: 'The issuer secret does not authorize this transaction.',
  };

  if (messages[resultCode]) {
    return { code: 'STELLAR_TRANSACTION_FAILED', message: messages[resultCode] };
  }

  if (candidate.message?.toLowerCase().includes('account not found')) {
    return {
      code: 'STELLAR_ACCOUNT_NOT_FOUND',
      message: 'The issuer account was not found on Stellar.',
    };
  }

  return {
    code: 'STELLAR_REQUEST_FAILED',
    message: 'The Stellar network rejected or could not process the request.',
  };
}

router.post('/tokens/issue', async (req: Request, res: Response): Promise<void> => {
  const parsed = issueTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }

  const input = parsed.data;
  let txHash: string;

  try {
    txHash = await issueAsset({
      issuerSecret: input.issuerSecret,
      assetCode: input.assetCode,
      distributorPublicKey: input.distributorPublicKey,
      amount: input.amount,
      ...(input.memo !== undefined ? { memo: input.memo } : {}),
    });
  } catch (error) {
    res.status(502).json({ data: null, error: stellarError(error) });
    return;
  }

  let issuerPublicKey: string | undefined;
  if (input.communityId) {
    try {
      issuerPublicKey = Keypair.fromSecret(input.issuerSecret).publicKey();
      await db.query(
        `INSERT INTO tokens
           (community_id, asset_code, asset_issuer, issuer_public_key,
            distributor_public_key, total_supply, issuance_tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.communityId,
          input.assetCode,
          issuerPublicKey,
          issuerPublicKey,
          input.distributorPublicKey,
          input.amount,
          txHash,
        ]
      );
    } catch {
      res.status(500).json({
        data: null,
        error: {
          code: 'TOKEN_METADATA_PERSISTENCE_FAILED',
          message: 'The asset was issued, but its metadata could not be saved. Do not retry automatically.',
        },
      });
      return;
    }
  }

  const data = {
    txHash,
    assetCode: input.assetCode,
    ...(issuerPublicKey ? { issuer: issuerPublicKey } : {}),
    distributor: input.distributorPublicKey,
    amount: input.amount,
  };

  res.status(201).json({ data, txHash });
});

router.post('/tokens/trustline', async (req: Request, res: Response): Promise<void> => {
  const parsed = trustlineTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }

  try {
    const txHash = await establishTrustline(parsed.data);
    res.status(201).json({ data: { txHash }, txHash });
  } catch (error) {
    res.status(502).json({ data: null, error: stellarError(error) });
  }
});

router.post('/tokens/burn', async (req: Request, res: Response): Promise<void> => {
  const parsed = burnTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }

  try {
    const txHash = await burnAsset(parsed.data);
    res.status(201).json({ data: { txHash }, txHash });
  } catch (error) {
    res.status(502).json({ data: null, error: stellarError(error) });
  }
});

export default router;
