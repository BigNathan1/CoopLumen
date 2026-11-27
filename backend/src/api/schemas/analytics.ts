import { z } from 'zod';

export const analyticsParamsSchema = z.object({
  communityId: z.string().uuid('communityId must be a valid UUID'),
});

export const analyticsQuerySchema = z.object({
  assetCode: z.string().trim().min(1).max(12).optional(),
});
