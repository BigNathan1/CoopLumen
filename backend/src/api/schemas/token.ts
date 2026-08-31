import { z } from 'zod';

const stellarPublicKey = z.string().regex(/^G[A-Z2-7]{55}$/, 'must be a valid Stellar public key');

const stellarSecretKey = z.string().regex(/^S[A-Z2-7]{55}$/, 'must be a valid Stellar secret key');

const assetCode = z
  .string()
  .regex(/^[A-Za-z0-9]{1,12}$/, 'assetCode must be 1 to 12 alphanumeric characters');

const amount = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/, 'amount must be a positive decimal string')
  .refine((value) => Number(value) > 0, 'amount must be greater than zero');

export const issueTokenSchema = z.object({
  // Optional for backwards compatibility with the existing route tests and
  // callers. Metadata is persisted whenever the community is supplied.
  communityId: z.string().uuid('communityId must be a valid UUID').optional(),
  issuerSecret: stellarSecretKey,
  assetCode,
  distributorPublicKey: stellarPublicKey,
  amount,
  memo: z.string().trim().max(28, 'memo must be 28 characters or fewer').optional(),
  // Token metadata fields
  name: z
    .string()
    .trim()
    .min(1, 'name must not be empty')
    .max(64, 'name must be 64 characters or fewer')
    .optional(),
  description: z.string().trim().max(500, 'description must be 500 characters or fewer').optional(),
  iconUrl: z.string().trim().url('iconUrl must be a valid URL').optional(),
  decimals: z
    .number()
    .int()
    .min(0, 'decimals must be 0 or greater')
    .max(7, 'decimals must be 7 or fewer')
    .default(7),
});

export const trustlineTokenSchema = z.object({
  accountSecret: stellarSecretKey,
  assetCode,
  assetIssuer: stellarPublicKey,
  limit: amount.optional(),
});

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
});

export const burnTokenSchema = z.object({
  holderSecret: stellarSecretKey,
  assetCode,
  assetIssuer: stellarPublicKey,
  amount,
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

export type IssueTokenInput = z.infer<typeof issueTokenSchema>;
export type AdminTokensQuery = z.infer<typeof adminTokensQuerySchema>;
