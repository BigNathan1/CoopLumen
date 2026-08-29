import { createHmac } from 'crypto';
import { Request, Response } from 'express';
import {
  verifyWebhookSignature,
  STELLAR_WEBHOOK_SIGNATURE_HEADER,
} from '../webhookSignature';

jest.mock('../../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const SECRET = 'test-webhook-secret';

function sign(secret: string, payload: Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function mockReqRes(opts: { body: Buffer; signature?: string }): {
  req: Request;
  res: Response;
  next: jest.Mock;
  json: jest.Mock;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const headers: Record<string, string> = {};
  if (opts.signature !== undefined) {
    headers[STELLAR_WEBHOOK_SIGNATURE_HEADER] = opts.signature;
  }

  const req = {
    header: (name: string) => headers[name.toLowerCase()],
    rawBody: opts.body,
  } as unknown as Request;
  const res = { status } as unknown as Response;
  const next = jest.fn();

  return { req, res, next, json, status };
}

describe('verifyWebhookSignature', () => {
  const originalSecret = process.env.STELLAR_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.STELLAR_WEBHOOK_SECRET = SECRET;
  });

  afterAll(() => {
    process.env.STELLAR_WEBHOOK_SECRET = originalSecret;
  });

  it('calls next() when the signature matches the raw body', () => {
    const body = Buffer.from(JSON.stringify({ eventId: 'evt_1' }));
    const { req, res, next, status } = mockReqRes({ body, signature: sign(SECRET, body) });

    verifyWebhookSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the signature header is missing', () => {
    const body = Buffer.from('{}');
    const { req, res, next, status, json } = mockReqRes({ body });

    verifyWebhookSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Missing') })
    );
  });

  it('rejects with 401 when the signature does not match', () => {
    const body = Buffer.from(JSON.stringify({ eventId: 'evt_1' }));
    const { req, res, next, status, json } = mockReqRes({ body, signature: 'deadbeef'.repeat(8) });

    verifyWebhookSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Invalid webhook signature.' })
    );
  });

  it('rejects with 401 when the signature is not valid hex (does not throw)', () => {
    const body = Buffer.from(JSON.stringify({ eventId: 'evt_1' }));
    const { req, res, next, status } = mockReqRes({ body, signature: 'not-hex!!' });

    expect(() => verifyWebhookSignature(req, res, next)).not.toThrow();
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the signature is signed with the wrong secret', () => {
    const body = Buffer.from(JSON.stringify({ eventId: 'evt_1' }));
    const { req, res, next, status } = mockReqRes({ body, signature: sign('wrong-secret', body) });

    verifyWebhookSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('detects tampering: a signature valid for one payload is rejected for another', () => {
    const originalBody = Buffer.from(JSON.stringify({ eventId: 'evt_1', amount: '10' }));
    const tamperedBody = Buffer.from(JSON.stringify({ eventId: 'evt_1', amount: '10000' }));
    const { req, res, next, status } = mockReqRes({
      body: tamperedBody,
      signature: sign(SECRET, originalBody),
    });

    verifyWebhookSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('fails closed with 503 when no secret is configured', () => {
    delete process.env.STELLAR_WEBHOOK_SECRET;
    const body = Buffer.from('{}');
    const { req, res, next, status, json } = mockReqRes({ body, signature: 'abcd' });

    verifyWebhookSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('not configured') })
    );
  });

  it('returns 500 when the raw body was not captured upstream', () => {
    const { req, res, next, status } = mockReqRes({
      body: undefined as unknown as Buffer,
      signature: 'abcd',
    });

    verifyWebhookSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(500);
  });
});
