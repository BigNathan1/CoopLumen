import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

export const kycStatusParamsSchema = z.object({
  address: z.string().trim().refine(isValidStellarPublicKey, {
    message: 'address must be a valid Stellar public key',
  }),
});

export type KycStatusParams = z.infer<typeof kycStatusParamsSchema>;
