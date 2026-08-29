import { z } from 'zod';

export const getXlmPriceQuerySchema = z.object({
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3,4}$/, { message: 'currency must be a valid 3- or 4-letter currency code' })
    .optional()
    .default('USD'),
});

export type GetXlmPriceQueryInput = z.infer<typeof getXlmPriceQuerySchema>;
