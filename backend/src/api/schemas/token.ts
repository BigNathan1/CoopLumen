import { z } from 'zod';

const stellarPublicKey = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'must be a valid Stellar public key');

const stellarSecretKey = z
  .string()
  .regex(/^S[A-Z2-7]{55}$/, 'must be a valid Stellar secret key');

const assetCode = z
  .string()
  .trim()
  .min(1, 'assetCode is required')
  .max(12, 'assetCode must be 12 characters or fewer')
  .regex(/^[A-Za-z0-9]+$/, 'assetCode must be alphanumeric');

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
});

export const trustlineTokenSchema = z.object({
  accountSecret: stellarSecretKey,
  assetCode,
  assetIssuer: stellarPublicKey,
  amount: decimalAmount.refine((value) => Number(value) > 0, {
    message: 'Amount must be greater than zero',
  }),
});

export const burnTokenSchema = z.object({
  holderSecret: stellarSecretKey,
  assetCode,
  assetIssuer: stellarPublicKey,
  limit: decimalAmount.optional(),
});

export type IssueTokenInput = z.infer<typeof issueTokenSchema>;
