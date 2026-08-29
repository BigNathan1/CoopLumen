import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

export const accountParamsSchema = z.object({
  publicKey: z
    .string()
    .trim()
    .refine(isValidStellarPublicKey, { message: 'publicKey must be a valid Stellar public key' }),
});

export type AccountParamsInput = z.infer<typeof accountParamsSchema>;
