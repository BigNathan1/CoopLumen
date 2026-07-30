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

export const updateCommunitySchema = z
  .object({
    name: z.string().trim().min(2).max(64).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.name === undefined && value.description === undefined && value.settings === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requestBody'],
        message: 'At least one of name, description, or settings must be provided',
      });
    }
  });

export const addMemberSchema = z.object({
  stellarAddress: stellarPublicKey,
  role: role.optional(),
});

export const updateMemberSchema = z.object({
  role,
});

export const setAvatarSchema = z.object({
  avatarUrl: z.string().trim().url({ message: 'avatarUrl must be a valid URL' }).max(2048),
});

/** Validates the `:id` path parameter on treasury and other community routes. */
export const communityIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Community ID must be a valid UUID' }),
});
