import { Router, Request, Response } from 'express';
import type { Horizon } from '@stellar/stellar-sdk';
import { StellarService } from '../../contracts/stellar';
import { validateQuery } from '../middleware/validate';
import { streamPaymentsQuerySchema, type StreamPaymentsQueryInput } from '../schemas/stream';

export const streamRouter = Router();

/** How often a comment-only keep-alive frame is written, in milliseconds. */
export const SSE_HEARTBEAT_MS = 15_000;

/** Reconnection delay advertised to the browser, in milliseconds. */
export const SSE_RETRY_MS = 3_000;

/** SSE frame names this endpoint emits. */
export const SSE_EVENTS = {
  READY: 'ready',
  PAYMENT: 'payment',
  ERROR: 'error',
} as const;

/** Writes one Server-Sent Event frame. */
function writeEvent(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

/**
 * `GET /api/v1/stream/payments?publicKey=…&cursor=…`
 *
 * Opens a Server-Sent Events feed of real-time payment operations for a Stellar
 * account, backed by `StellarService.streamPayments` (Horizon's `/payments`
 * event stream). Each frame is JSON in the same `{ data, meta?, error? }`
 * envelope the rest of the API uses, so the client has one response shape to
 * parse whether a frame carries a payment or a failure:
 *
 * - `event: ready` — the subscription is live and echoes the account + cursor.
 * - `event: payment` — `{ data: <Horizon payment record> }`.
 * - `event: error` — `{ data: null, error: <message> }`.
 *
 * Validation happens before any header is flushed, so a bad `publicKey` still
 * gets the standard `400 { data, error, meta }` JSON envelope. Once streaming
 * has begun the status is already committed to `200`, and errors travel as
 * SSE `error` frames instead. A comment-only keep-alive frame is written on an
 * interval so proxies do not drop an idle connection.
 *
 * The Horizon subscription and the heartbeat are both torn down when the
 * client disconnects, so no listener outlives its request.
 */
export function streamPaymentsHandler(req: Request, res: Response): void {
  const { publicKey, cursor } = req.query as unknown as StreamPaymentsQueryInput;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Tells nginx not to buffer the response, which would defeat streaming.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const send = (event: string, payload: unknown): void => {
    if (closed) return;
    writeEvent(res, event, payload);
  };

  res.write(`retry: ${SSE_RETRY_MS}\n\n`);
  send(SSE_EVENTS.READY, { data: { publicKey, cursor } });

  const heartbeat = setInterval(() => {
    if (closed) return;
    res.write(': keep-alive\n\n');
  }, SSE_HEARTBEAT_MS);
  // Never let the heartbeat alone keep the process alive.
  heartbeat.unref?.();

  const cancel = StellarService.streamPayments(
    publicKey,
    (payment: Horizon.ServerApi.PaymentOperationRecord) =>
      send(SSE_EVENTS.PAYMENT, { data: payment }),
    (error: Error) => send(SSE_EVENTS.ERROR, { data: null, error: error.message }),
    cursor
  );

  req.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
    cancel();
  });
}

streamRouter.get('/payments', validateQuery(streamPaymentsQuerySchema), streamPaymentsHandler);
