import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

export const kycStatusParamsSchema = z.object({
  address: z.string().trim().refine(isValidStellarPublicKey, {
    message: 'address must be a valid Stellar public key',
  }),
});

export type KycStatusParams = z.infer<typeof kycStatusParamsSchema>;
export const initiateKycSchema = z.object({
  communityId: z.string().uuid({ message: 'communityId must be a valid UUID' }),
  address: z.string().trim().refine(isValidStellarPublicKey, {
    message: 'address must be a valid Stellar public key',
  }),
  provider: z.string().trim().min(1).max(100).default('sep12'),
});

export type InitiateKycInput = z.infer<typeof initiateKycSchema>;

export const worldIdVerificationLevelSchema = z.enum(['orb', 'device']);

export type WorldIdVerificationLevel = z.infer<typeof worldIdVerificationLevelSchema>;

export const worldIdVerifySchema = z.object({
  app_id: z.string().trim().min(1).max(200),
  action: z.string().trim().min(1).max(200),
  signal: z.string().trim().min(1).max(500),
  proof: z.string().trim().min(1),
  merkle_root: z.string().trim().min(1),
  nullifier_hash: z.string().trim().min(1),
  verification_level: worldIdVerificationLevelSchema,
});

export type WorldIdVerifyInput = z.infer<typeof worldIdVerifySchema>;

export const worldIdStatusSchema = z.object({
  verified: z.boolean(),
  verified_at: z.string().datetime().nullable(),
});

export type WorldIdStatus = z.infer<typeof worldIdStatusSchema>;