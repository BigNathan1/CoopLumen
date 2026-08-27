import { Router, Request, Response, NextFunction } from 'express';
import { Asset, Keypair, Operation, TransactionBuilder, BASE_FEE } from '@stellar/stellar-sdk';
import { z } from 'zod';
import { issueAsset, burnAsset, getAssetHolders, getAssetSupply } from '../../contracts/assets';
import { establishTrustline } from '../../contracts/trustlines';
import { db } from '../../db';
import { invalidateBalanceCache } from '../../cache/balances';
import { StellarService } from '../../contracts/stellar';
import { validateBody } from '../middleware/validate';
import { idempotent } from '../middleware/idempotency';
import { issueTokenSchema, trustlineTokenSchema, burnTokenSchema } from '../schemas/token';
import { isValidStellarPublicKey } from '../utils/stellar';
import { mapHorizonError } from '../utils/horizonError';
import {
  getNativeBalance,
  getRequiredXlmForFee,
  getRequiredXlmForTransaction,
  getTransactionDestination,
  getTransactionSource,
} from '../utils/stellarTransaction';

import { tokenIssueLimiter } from '../middleware/rateLimit';

export const tokenRouter: Router = Router();

const tokenParamsSchema = z.object({
  assetCode: z
    .string()
    .regex(/^[A-Za-z0-9]{1,12}$/, 'assetCode must be 1 to 12 alphanumeric characters'),
  issuer: z.string().refine(isValidStellarPublicKey, 'issuer must be a valid Stellar public key'),
});

const transferSchema = z.object({
  signedXdr: z.string().trim().min(1, 'signedXdr is required').max(100_000),
});

const airdropSchema = z.object({
  communityId: z.string().uuid(),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,7})?$/, 'amount must be a positive decimal with up to 7 places')
    .refine((value) => Number(value) > 0, 'amount must be greater than zero'),
  issuerSecret: z.string().trim().min(1, 'issuerSecret is required'),
});

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

interface CommunityRow {
  asset_code: string;
  asset_issuer: string;
}

interface MemberRow {
  stellar_address: string;
}

/**
 * POST /api/v1/tokens/issue
 * Issues a community token on the Stellar network.
 * The issuer secret must be held server-side for this endpoint (e.g., community treasury key).
 * In production, prefer the client-sign flow (/api/tokens/build-issue).
 * Accepts an optional Idempotency-Key header; a retried request with the same
 * key replays the original response instead of issuing a second time.
 * When `communityId` is supplied, the issued token's metadata is persisted to
 * the `tokens` table so it is immediately visible via GET /:communityId.
 * Rate limited to 3 requests per minute per authenticated user.
 */
tokenRouter.post(
  '/issue',
  tokenIssueLimiter,
  idempotent('POST /api/v1/tokens/issue'),
  validateBody(issueTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { communityId, issuerSecret, assetCode, distributorPublicKey, amount, memo } =
        req.body as {
          communityId?: string;
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

      let issuerPublicKey: string | undefined;
      if (communityId) {
        try {
          issuerPublicKey = Keypair.fromSecret(issuerSecret).publicKey();
          await db.query(
            `INSERT INTO tokens
               (community_id, asset_code, asset_issuer, issuer_public_key,
                distributor_public_key, total_supply, issuance_tx_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              communityId,
              assetCode,
              issuerPublicKey,
              issuerPublicKey,
              distributorPublicKey,
              amount,
              txHash,
            ]
          );
        } catch {
          res.status(500).json({
            data: null,
            error: {
              code: 'TOKEN_METADATA_PERSISTENCE_FAILED',
              message:
                'The asset was issued, but its metadata could not be saved. Do not retry automatically.',
            },
          });
          return;
        }
      }

      res.status(201).json({ data: { txHash } });
    } catch (err) {
      if ((err as { response?: unknown }).response) {
        const mapped = mapHorizonError(err);
        res.status(mapped.status).json({ data: null, error: mapped.message });
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
        res.status(mapped.status).json({ data: null, error: mapped.message });
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
  validateBody(trustlineTokenSchema),
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
 * POST /api/v1/tokens/transfer
 * Submits a client-signed payment transaction on behalf of a user.
 */
tokenRouter.post('/transfer', async (req: Request, res: Response): Promise<void> => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      data: null,
      meta: {
        errors: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
      error: 'Invalid request body',
    });
    return;
  }

  let transaction: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    transaction = TransactionBuilder.fromXDR(parsed.data.signedXdr, StellarService.getNetwork());
  } catch {
    res.status(400).json({
      data: null,
      error: 'The signedXdr is not a valid transaction for the configured Stellar network.',
    });
    return;
  }

  if (transaction.operations.length !== 1 || transaction.operations[0]?.type !== 'payment') {
    res.status(400).json({
      data: null,
      error: 'The signed transaction must contain exactly one payment operation.',
    });
    return;
  }

  try {
    const result = await StellarService.submitTransaction(transaction);
    await invalidateBalanceCache([
      getTransactionSource(transaction),
      getTransactionDestination(transaction),
    ]);
    res.status(200).json({ data: { txHash: result.hash } });
  } catch (error) {
    const sourcePublicKey = getTransactionSource(transaction);
    const account =
      sourcePublicKey !== undefined
        ? await StellarService.loadAccount(sourcePublicKey).catch(() => null)
        : null;
    const mapped = mapHorizonError(error, {
      requiredXlm: getRequiredXlmForTransaction(transaction),
      currentBalance: account ? getNativeBalance(account) : undefined,
    });

    if (mapped.code === 'INSUFFICIENT_BALANCE') {
      res.status(mapped.status).json({
        data: null,
        error: {
          code: mapped.code,
          message: mapped.message,
          requiredXlm: mapped.requiredXlm,
          currentBalance: mapped.currentBalance,
        },
      });
      return;
    }

    res.status(mapped.status).json({ data: null, error: mapped.message });
  }
});

/**
 * POST /api/v1/tokens/airdrop
 * Distributes an equal token amount from the community's issuer account to
 * every current member.
 */
tokenRouter.post('/airdrop', async (req: Request, res: Response): Promise<void> => {
  const parsed = airdropSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      data: null,
      error: 'Invalid request body',
      meta: { errors: parsed.error.flatten().fieldErrors },
    });
    return;
  }

  let currentBalance: string | undefined;

  try {
    const { communityId, amount, issuerSecret } = parsed.data;
    const communities = await db.query<CommunityRow>(
      `SELECT asset_code, asset_issuer
       FROM communities
       WHERE id = $1 AND deleted_at IS NULL`,
      [communityId]
    );

    if (communities.length === 0) {
      res.status(404).json({ data: null, error: 'Community not found' });
      return;
    }

    const members = await db.query<MemberRow>(
      `SELECT stellar_address
       FROM members
       WHERE community_id = $1`,
      [communityId]
    );

    if (members.length === 0) {
      res
        .status(400)
        .json({ data: null, error: 'Community has no members to receive the airdrop' });
      return;
    }

    let issuer: Keypair;
    try {
      issuer = Keypair.fromSecret(issuerSecret);
    } catch {
      res.status(400).json({ data: null, error: 'issuerSecret is not a valid Stellar secret key' });
      return;
    }

    const community = communities[0];
    if (issuer.publicKey() !== community.asset_issuer) {
      res.status(400).json({
        data: null,
        error: 'issuerSecret does not belong to the community token issuer',
      });
      return;
    }

    const network = StellarService.getNetwork();
    const asset = new Asset(community.asset_code, community.asset_issuer);
    const txHashes: string[] = [];

    for (const member of members) {
      const account = await StellarService.loadAccount(issuer.publicKey());
      currentBalance = getNativeBalance(account);
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: network,
      })
        .addOperation(
          Operation.payment({
            destination: member.stellar_address,
            asset,
            amount,
          })
        )
        .setTimeout(30)
        .build();

      transaction.sign(issuer);
      const result = await StellarService.submitTransaction(transaction);
      txHashes.push(result.hash);
    }

    await invalidateBalanceCache([
      issuer.publicKey(),
      ...members.map((member) => member.stellar_address),
    ]);

    res.status(200).json({
      data: {
        amount,
        recipientCount: members.length,
        txHashes,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid Stellar')) {
      res.status(400).json({ data: null, error: error.message });
      return;
    }

    const mapped = mapHorizonError(error, {
      requiredXlm: getRequiredXlmForFee(BASE_FEE),
      currentBalance,
    });

    if (mapped.code === 'INSUFFICIENT_BALANCE') {
      res.status(mapped.status).json({
        data: null,
        error: {
          code: mapped.code,
          message: mapped.message,
          requiredXlm: mapped.requiredXlm,
          currentBalance: mapped.currentBalance,
        },
      });
      return;
    }

    res.status(mapped.status).json({ data: null, error: mapped.message });
  }
});

/**
 * GET /api/v1/tokens/:assetCode/:issuer
 * Fetches metadata for a single token by its community's primary asset.
 */
tokenRouter.get('/:assetCode/:issuer', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = tokenParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      data: null,
      error: 'Validation failed',
      meta: {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  try {
    const [token] = await db.query(
      `SELECT id, asset_code, asset_issuer, name, description
         FROM communities
         WHERE asset_code = $1 AND asset_issuer = $2`,
      [parsed.data.assetCode, parsed.data.issuer]
    );

    if (!token) {
      res.status(404).json({ data: null, error: 'Token not found' });
      return;
    }

    res.json({ data: token });
  } catch (err) {
    next(err);
  }
});

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
        res.status(400).json({ data: null, error: 'Invalid Stellar issuer address' });
        return;
      }

      const holders = await getAssetHolders(assetCode, issuer);
      res.json({ data: holders });
    } catch (err) {
      if ((err as { response?: unknown }).response) {
        const mapped = mapHorizonError(err);
        res.status(mapped.status).json({ data: null, error: mapped.message });
        return;
      }
      next(err);
    }
  }
);

/**
 * GET /api/v1/tokens/supply/:assetCode/:issuer
 * Returns the current circulating supply Horizon reports for an issued asset.
 */
tokenRouter.get(
  '/supply/:assetCode/:issuer',
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = tokenParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        data: null,
        error: 'Invalid request parameters',
        meta: {
          errors: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }

    try {
      const supply = await getAssetSupply(parsed.data.assetCode, parsed.data.issuer);
      res.json({ data: { assetCode: parsed.data.assetCode, issuer: parsed.data.issuer, supply } });
    } catch (err) {
      if ((err as { response?: unknown }).response) {
        res.status(502).json({
          data: null,
          error: 'Horizon is temporarily unavailable. Please try again later.',
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * GET /api/v1/tokens/history/:assetCode/:issuer
 * Returns recent payment activity for an asset. Horizon has no
 * "operations/payments for an asset" endpoint, so the issuer account's
 * payment history filtered to this asset is the closest available proxy.
 */
tokenRouter.get(
  '/history/:assetCode/:issuer',
  (req: Request, res: Response, next: NextFunction): void => {
    const parsed = tokenParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid token history parameters' },
        meta: { errors: parsed.error.issues },
      });
      return;
    }

    const { assetCode, issuer } = parsed.data;

    StellarService.call('payments.forAccount', () =>
      StellarService.getServer().payments().forAccount(issuer).limit(20).order('desc').call()
    )
      .then((page) => {
        const records = page.records.filter(
          (record) =>
            'asset_code' in record &&
            record.asset_code === assetCode &&
            'asset_issuer' in record &&
            record.asset_issuer === issuer
        );

        res.status(200).json({ data: records, meta: { assetCode, issuer, limit: 20 } });
      })
      .catch(next);
  }
);
