import { EventEmitter } from 'events';
import request from 'supertest';
import type { Request, Response } from 'express';
import type { Horizon } from '@stellar/stellar-sdk';

jest.mock('../../../db', () => ({
  db: { ping: jest.fn().mockResolvedValue(true) },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import app from '../../../app';
import { StellarService } from '../../../contracts/stellar';
import { SSE_EVENTS, SSE_RETRY_MS, streamPaymentsHandler } from '../stream';

const PUBLIC_KEY = `G${'A'.repeat(55)}`;

type StreamArgs = {
  onMessage: (payment: Horizon.ServerApi.PaymentOperationRecord) => void;
  onError: (error: Error) => void;
  cursor: string;
};

function mockStream() {
  const cancel = jest.fn();
  const calls: StreamArgs[] = [];

  jest
    .spyOn(StellarService, 'streamPayments')
    .mockImplementation((_publicKey, onMessage, onError, cursor = 'now') => {
      calls.push({ onMessage, onError, cursor });
      return cancel;
    });

  return { cancel, calls };
}

interface FakeResponse {
  headers: Record<string, string>;
  statusCode?: number;
  chunks: string[];
  flushCount: number;
  write: (chunk: string) => boolean;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => FakeResponse;
  flushHeaders: () => void;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    headers: {},
    statusCode: undefined,
    chunks: [],
    flushCount: 0,
    write: (chunk: string) => {
      res.chunks.push(chunk);
      return true;
    },
    setHeader: (name, value) => {
      res.headers[name.toLowerCase()] = value;
    },
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    flushHeaders: () => {
      res.flushCount += 1;
    },
  };
  return res;
}

function fakeRequest(
  query: Record<string, string>
): EventEmitter & { query: Record<string, string> } {
  const req = new EventEmitter() as EventEmitter & { query: Record<string, string> };
  req.query = query;
  return req;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/v1/stream/payments', () => {
  it('rejects a missing publicKey with the standard JSON error envelope', async () => {
    const response = await request(app).get('/api/v1/stream/payments');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      data: null,
      error: 'Validation failed',
      meta: {
        errors: expect.arrayContaining([expect.objectContaining({ path: 'publicKey' })]),
      },
    });
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('rejects a malformed publicKey before opening a stream', async () => {
    const { calls } = mockStream();

    const response = await request(app).get('/api/v1/stream/payments?publicKey=not-a-key');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(calls).toHaveLength(0);
  });

  it('opens an SSE response with the right headers and a ready frame', () => {
    const stream = mockStream();
    const res = fakeResponse();
    const req = fakeRequest({ publicKey: PUBLIC_KEY, cursor: 'now' });

    streamPaymentsHandler(req as unknown as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers.connection).toBe('keep-alive');
    expect(res.flushCount).toBe(1);

    const body = res.chunks.join('');
    expect(body).toContain(`retry: ${SSE_RETRY_MS}`);
    expect(body).toContain(`event: ${SSE_EVENTS.READY}`);
    expect(body).toContain(PUBLIC_KEY);

    req.emit('close');
  });

  it('forwards the publicKey and cursor to StellarService.streamPayments', () => {
    const stream = mockStream();
    const res = fakeResponse();
    const req = fakeRequest({ publicKey: PUBLIC_KEY, cursor: '12345' });

    streamPaymentsHandler(req as unknown as Request, res as unknown as Response);

    expect(stream.calls).toHaveLength(1);
    expect(stream.calls[0].cursor).toBe('12345');

    req.emit('close');
  });

  it('streams each Horizon payment as an event-framed envelope', () => {
    const stream = mockStream();
    const res = fakeResponse();
    const req = fakeRequest({ publicKey: PUBLIC_KEY, cursor: 'now' });

    streamPaymentsHandler(req as unknown as Request, res as unknown as Response);

    const payment = {
      id: 'op-1',
      type: 'payment',
      amount: '10.0000000',
    } as unknown as Horizon.ServerApi.PaymentOperationRecord;
    stream.calls[0].onMessage(payment);

    const chunk = res.chunks.at(-1) as string;
    expect(chunk).toContain(`event: ${SSE_EVENTS.PAYMENT}`);
    expect(chunk).toContain(JSON.stringify({ data: payment }));

    req.emit('close');
  });

  it('reports a stream failure as an error frame rather than a raw exception', () => {
    const stream = mockStream();
    const res = fakeResponse();
    const req = fakeRequest({ publicKey: PUBLIC_KEY, cursor: 'now' });

    streamPaymentsHandler(req as unknown as Request, res as unknown as Response);
    stream.calls[0].onError(new Error('Horizon unavailable'));

    const chunk = res.chunks.at(-1) as string;
    expect(chunk).toContain(`event: ${SSE_EVENTS.ERROR}`);
    expect(chunk).toContain('Horizon unavailable');

    req.emit('close');
  });

  it('tears down the Horizon subscription when the client disconnects', () => {
    const stream = mockStream();
    const res = fakeResponse();
    const req = fakeRequest({ publicKey: PUBLIC_KEY, cursor: 'now' });

    streamPaymentsHandler(req as unknown as Request, res as unknown as Response);
    expect(stream.cancel).not.toHaveBeenCalled();

    req.emit('close');
    expect(stream.cancel).toHaveBeenCalledTimes(1);

    const framesAfterClose = res.chunks.length;
    stream.calls[0].onMessage({ id: 'late' } as Horizon.ServerApi.PaymentOperationRecord);
    expect(res.chunks).toHaveLength(framesAfterClose);
  });
});
