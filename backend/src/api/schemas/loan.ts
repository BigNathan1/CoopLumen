import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

const stellarPublicKey = z
  .string()
  .trim()
  .refine(isValidStellarPublicKey, { message: 'Invalid Stellar public key' });

/** A positive monetary amount with up to 7 decimal places (Stellar precision). */
const amount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,7})?$/, { message: 'Amount must be a positive number with up to 7 decimals' })
  .refine((v) => Number(v) > 0, { message: 'Amount must be greater than zero' });

export const createLoanSchema = z.object({
  communityId: z.string().uuid(),
  borrowerAddress: stellarPublicKey,
  lenderAddress: stellarPublicKey,
  amount,
  assetCode: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9]+$/, { message: 'Asset code must be alphanumeric' }),
  assetIssuer: stellarPublicKey.optional(),
  purpose: z.string().trim().max(280).optional(),
  dueAt: z.coerce.date().optional(),
});

export const disburseLoanSchema = z.object({
  stellarTxHash: z.string().trim().min(1).max(128).optional(),
  note: z.string().trim().max(280).optional(),
});

export const repayLoanSchema = z.object({
  amount,
  paymentId: z.string().uuid().optional(),
  note: z.string().trim().max(280).optional(),
});

export const defaultLoanSchema = z.object({
  note: z.string().trim().max(280).optional(),
});
