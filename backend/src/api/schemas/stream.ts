import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

/**
 * Query parameters accepted by `GET /api/v1/stream/payments`.
 *
 * `publicKey` names the Stellar account to follow and `cursor` is the Horizon
 * paging token to resume from. Horizon treats `now` as "only events from this
 * moment on", which is the safe default for a live feed.
 */
export const streamPaymentsQuerySchema = z.object({
  publicKey: z
    .string()
    .trim()
    .refine(isValidStellarPublicKey, 'publicKey must be a valid Stellar public key'),
  cursor: z.string().trim().min(1).max(128).optional().default('now'),
});

export type StreamPaymentsQueryInput = z.infer<typeof streamPaymentsQuerySchema>;
