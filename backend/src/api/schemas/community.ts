import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

const stellarPublicKey = z
  .string()
  .trim()
  .refine(isValidStellarPublicKey, { message: 'Invalid Stellar public key' });

const role = z.enum(['admin', 'treasurer', 'member', 'observer']);

export const createCommunitySchema = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(500).optional(),
  issuerPublicKey: stellarPublicKey,
  assetCode: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9]+$/, { message: 'Asset code must be alphanumeric' }),
  assetIssuer: stellarPublicKey,
});

export const updateCommunitySchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const addMemberSchema = z.object({
  stellarAddress: stellarPublicKey,
  role: role.optional(),
});

export const updateMemberSchema = z.object({
  role,
});
