import { z } from 'zod';

/**
 * Payload shape for incoming Stellar webhook notifications (e.g. from a
 * Horizon-event forwarder or a custom notification relay watching an
 * account). `data` is intentionally loose — event-specific fields vary by
 * `eventType` and are not re-validated here.
 */
export const stellarWebhookSchema = z.object({
  eventId: z.string().trim().min(1, 'eventId is required'),
  eventType: z.enum([
    'transaction.succeeded',
    'transaction.failed',
    'account.created',
    'trustline.created',
    'trustline.removed',
    'payment.received',
  ]),
  occurredAt: z.string().datetime({ message: 'occurredAt must be an ISO 8601 timestamp' }),
  data: z.record(z.string(), z.unknown()),
});

export type StellarWebhookPayload = z.infer<typeof stellarWebhookSchema>;
