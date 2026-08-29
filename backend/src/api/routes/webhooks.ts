import { Router, Request, Response } from 'express';
import { verifyWebhookSignature } from '../middleware/webhookSignature';
import { validateBody } from '../middleware/validate';
import { stellarWebhookSchema } from '../schemas/webhook';
import { logger } from '../../utils/logger';

export const webhookRouter = Router();

/**
 * POST /api/v1/webhooks/stellar
 * Receives Stellar account/transaction event notifications from a trusted
 * webhook source. The request must carry a valid HMAC-SHA256 signature (see
 * `verifyWebhookSignature`) computed over the raw request body with
 * `STELLAR_WEBHOOK_SECRET`; requests without one are rejected before the
 * body is even validated.
 */
webhookRouter.post(
  '/stellar',
  verifyWebhookSignature,
  validateBody(stellarWebhookSchema),
  (req: Request, res: Response): void => {
    const { eventId, eventType } = req.body as { eventId: string; eventType: string };

    logger.info('Received Stellar webhook event', { eventId, eventType });

    res.status(200).json({ data: { received: true, eventId } });
  }
);
