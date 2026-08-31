import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

const stellarAddress = z
  .string()
  .trim()
  .refine(isValidStellarPublicKey, { message: 'Invalid Stellar public key' });

export const authChallengeSchema = z.object({
  address: stellarAddress,
});

export const authVerifySchema = z.object({
  address: stellarAddress,
  challenge: z.string().trim().min(1).max(500),
  signature: z.string().trim().min(1).max(2000),
});
