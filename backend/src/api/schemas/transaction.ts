import { z } from 'zod';

export const transactionHashSchema = z.object({
  hash: z
    .string()
    .length(64, 'Transaction hash must be exactly 64 characters long')
    .regex(/^[a-fA-F0-9]{64}$/, 'Transaction hash must be a valid hex-encoded SHA-256 string'),
});

export type TransactionHashParams = z.infer<typeof transactionHashSchema>;
