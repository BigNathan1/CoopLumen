import { z } from 'zod';
import { Keypair } from '@stellar/stellar-sdk';

const stellarPublicKey = z.string().refine(
  (value) => {
    try {
      Keypair.fromPublicKey(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid Stellar public key' }
);

const decimalAmount = z.string().trim().regex(/^\d+(?:\.\d{1,7})?$/, {
  message: 'Amount must be a positive decimal string with up to 7 decimal places',
});

export const issueTokenSchema = z.object({
  issuerSecret: z
    .string()
    .trim()
    .regex(/^S[A-Z2-7]{55}$/, { message: 'Must be a valid Stellar secret key' }),
  assetCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,12}$/, { message: 'Asset code must be 1-12 alphanumeric characters' }),
  distributorPublicKey: stellarPublicKey,
  amount: decimalAmount.refine((value) => Number(value) > 0, {
    message: 'Amount must be greater than zero',
  }),
  communityId: z.string().uuid('Community ID must be a valid UUID').optional(),
  memo: z.string().trim().max(28, 'Memo must be at most 28 characters').optional(),
});

export const burnTokenSchema = z.object({
  holderSecret: z
    .string()
    .trim()
    .regex(/^S[A-Z2-7]{55}$/, { message: 'Must be a valid Stellar secret key' }),
  assetCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,12}$/, { message: 'Asset code must be 1-12 alphanumeric characters' }),
  assetIssuer: stellarPublicKey,
  amount: decimalAmount.refine((value) => Number(value) > 0, {
    message: 'Amount must be greater than zero',
  }),
});

export const trustlineTokenSchema = z.object({
  accountSecret: z
    .string()
    .trim()
    .regex(/^S[A-Z2-7]{55}$/, { message: 'Must be a valid Stellar secret key' }),
  assetCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,12}$/, { message: 'Asset code must be 1-12 alphanumeric characters' }),
  assetIssuer: stellarPublicKey,
  limit: decimalAmount.optional(),
});

export type IssueTokenInput = z.infer<typeof issueTokenSchema>;
export type BurnTokenInput = z.infer<typeof burnTokenSchema>;
export type TrustlineTokenInput = z.infer<typeof trustlineTokenSchema>;
