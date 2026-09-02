import { z } from 'zod';

const stellarPublicKey = z.string().regex(/^G[A-Z2-7]{55}$/, 'must be a valid Stellar public key');

const assetCode = z
  .string()
  .regex(/^[A-Za-z0-9]{1,12}$/, 'assetCode must be 1 to 12 alphanumeric characters');

const amount = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/, 'amount must be a positive decimal string')
  .refine((value) => Number(value) > 0, 'amount must be greater than zero');

export const buildIssueTokenSchema = z.object({
  issuerPublicKey: stellarPublicKey,
  assetCode,
  distributorPublicKey: stellarPublicKey,
  amount,
  memo: z.string().trim().max(28, 'memo must be 28 characters or fewer').optional(),
});

export const buildTrustlineTokenSchema = z.object({
  accountPublicKey: stellarPublicKey,
  assetCode,
  assetIssuer: stellarPublicKey,
  limit: amount.optional(),
});

export const submitTokenXdrSchema = z.object({
  signedXdr: z.string().trim().min(1, 'signedXdr is required').max(100_000),
  /**
   * Asks the server to re-read this asset's circulating supply from Horizon
   * after the transaction lands, so a burn is reflected in the tokens table.
   * Only the asset is taken from the caller - the figure itself comes from
   * the ledger, so a wrong or hostile value here cannot corrupt the record.
   */
  refreshSupply: z
    .object({
      assetCode,
      assetIssuer: stellarPublicKey,
    })
    .optional(),
});

export const buildBurnTokenSchema = z.object({
  holderPublicKey: stellarPublicKey,
  assetCode,
  assetIssuer: stellarPublicKey,
  amount,
});

export const buildAirdropSchema = z.object({
  communityId: z.string().uuid('communityId must be a valid UUID'),
  issuerPublicKey: stellarPublicKey,
  amount,
  memo: z.string().trim().max(28, 'memo must be 28 characters or fewer').optional(),
});

export const adminTokensQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  sortBy: z
    .enum(['created_at', 'name', 'asset_code', 'total_supply'])
    .default('created_at')
    .optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional(),
});

export type AdminTokensQuery = z.infer<typeof adminTokensQuerySchema>;
