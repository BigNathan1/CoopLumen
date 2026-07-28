import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

const stellarPublicKey = z
  .string()
  .trim()
  .refine(isValidStellarPublicKey, { message: 'Invalid Stellar public key' });

const stellarSecret = z.string().trim().min(56);

const amount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,7})?$/, { message: 'amount must be a positive decimal with up to 7 places' });

export const issueTokenSchema = z.object({
  issuerSecret: stellarSecret,
  assetCode: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9]+$/, { message: 'Asset code must be alphanumeric' }),
  distributorPublicKey: stellarPublicKey,
  amount,
  memo: z.string().trim().max(28).optional(),
});

export const trustlineSchema = z.object({
  accountSecret: stellarSecret,
  assetCode: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9]+$/, { message: 'Asset code must be alphanumeric' }),
  assetIssuer: stellarPublicKey,
  limit: amount.optional(),
});
