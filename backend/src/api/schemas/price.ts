import { z } from 'zod';

export const xlmPriceQuerySchema = z.object({
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => val === 'USD', {
      message: 'Currently only USD is supported as price currency',
    })
    .optional()
    .default('USD'),
});

export const priceParamsSchema = z.object({
  asset: z
    .string()
    .trim()
    .toLowerCase()
    .refine((val) => val === 'xlm', {
      message: 'Currently only xlm price is supported',
    }),
});

export type XlmPriceQueryInput = z.infer<typeof xlmPriceQuerySchema>;
export type PriceParamsInput = z.infer<typeof priceParamsSchema>;
