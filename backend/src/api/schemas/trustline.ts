import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

const stellarPublicKey = z
  .string()
  .trim()
  .refine(isValidStellarPublicKey, 'must be a valid Stellar public key');

const limitAmount = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/, 'limit must be a positive decimal string')
  .refine((value) => Number(value) > 0, 'limit must be greater than zero');

export const buildTrustlineSchema = z.object({
  accountPublicKey: stellarPublicKey,
  assetCode: z
    .string()
    .trim()
    .min(1, 'assetCode is required')
    .max(12, 'assetCode must be 12 characters or fewer')
    .regex(/^[A-Za-z0-9]+$/, 'assetCode must be alphanumeric'),
  assetIssuer: stellarPublicKey,
  limit: limitAmount.optional(),
});

export type BuildTrustlineInput = z.infer<typeof buildTrustlineSchema>;
