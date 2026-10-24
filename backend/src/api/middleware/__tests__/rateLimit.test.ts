/**
 * Behaviour of the rate limit and slow-down factories against the in-memory
 * store (no Redis), plus the fail-open policy when the Redis store errors.
 */
import express, { type Application, type RequestHandler } from 'express';
import request from 'supertest';

jest.mock('../../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockRedis = { isConfigured: jest.fn(), sendCommand: jest.fn() };
jest.mock('../../../cache/redis', () => ({ redisCache: mockRedis }));

import { createRateLimiter, createSlowDown, createStore } from '../rateLimit';

const appWith = (...middleware: RequestHandler[]): Application => {
  const app = express();
  app.set('trust proxy', true);
  app.use(...middleware);
  app.all('/', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

beforeEach(() => {
  mockRedis.isConfigured.mockReturnValue(false);
  mockRedis.sendCommand.mockReset();
});

describe('createRateLimiter', () => {
  it('allows requests up to the limit and then responds 429', async () => {
    const app = appWith(
      createRateLimiter({ name: 't-hard', windowMs: 60_000, max: 2, enforceInTests: true })
    );

    expect((await request(app).get('/')).status).toBe(200);
    expect((await request(app).get('/')).status).toBe(200);

    const blocked = await request(app).get('/');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      data: null,
      error: 'Too many requests, please try again later',
    });
  });

  it('counts each client IP separately', async () => {
    const app = appWith(
      createRateLimiter({ name: 't-ip', windowMs: 60_000, max: 1, enforceInTests: true })
    );

    expect((await request(app).get('/').set('X-Forwarded-For', '203.0.113.1')).status).toBe(200);
    expect((await request(app).get('/').set('X-Forwarded-For', '203.0.113.1')).status).toBe(429);
    expect((await request(app).get('/').set('X-Forwarded-For', '203.0.113.2')).status).toBe(200);
  });

  it('does not count read-only requests when writesOnly is set', async () => {
    const app = appWith(
      createRateLimiter({
        name: 't-writes',
        windowMs: 60_000,
        max: 1,
        writesOnly: true,
        enforceInTests: true,
      })
    );

    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/')).status).toBe(200);
    }
    expect((await request(app).post('/')).status).toBe(200);
    expect((await request(app).post('/')).status).toBe(429);
  });

  it('is skipped under test unless enforceInTests is set', async () => {
    const app = appWith(createRateLimiter({ name: 't-skip', windowMs: 60_000, max: 1 }));

    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/')).status).toBe(200);
    }
  });
});

describe('createSlowDown', () => {
  const timed = async (app: Application): Promise<number> => {
    const start = Date.now();
    await request(app).get('/').expect(200);
    return Date.now() - start;
  };

  it('serves requests at full speed up to delayAfter, then delays progressively', async () => {
    const app = appWith(
      createSlowDown({
        name: 't-slow',
        windowMs: 60_000,
        delayAfter: 2,
        delayStepMs: 150,
        maxDelayMs: 1000,
        enforceInTests: true,
      })
    );

    const first = await timed(app);
    const second = await timed(app);
    const third = await timed(app);
    const fourth = await timed(app);

    expect(first).toBeLessThan(140);
    expect(second).toBeLessThan(140);
    expect(third).toBeGreaterThanOrEqual(140); // 1 over: ~150ms
    expect(fourth).toBeGreaterThanOrEqual(290); // 2 over: ~300ms
  });

  it('never delays by more than maxDelayMs', async () => {
    const app = appWith(
      createSlowDown({
        name: 't-slow-cap',
        windowMs: 60_000,
        delayAfter: 0,
        delayStepMs: 400,
        maxDelayMs: 200,
        enforceInTests: true,
      })
    );

    await timed(app);
    const capped = await timed(app);
    expect(capped).toBeGreaterThanOrEqual(190);
    expect(capped).toBeLessThan(380);
  });

  it('delays before the hard limit blocks, when both are stacked', async () => {
    const app = appWith(
      createSlowDown({
        name: 't-stack',
        windowMs: 60_000,
        delayAfter: 1,
        delayStepMs: 150,
        maxDelayMs: 1000,
        enforceInTests: true,
      }),
      createRateLimiter({ name: 't-stack', windowMs: 60_000, max: 3, enforceInTests: true })
    );

    expect(await timed(app)).toBeLessThan(140);
    expect(await timed(app)).toBeGreaterThanOrEqual(140);
    expect(await timed(app)).toBeGreaterThanOrEqual(290);
    expect((await request(app).get('/')).status).toBe(429);
  });
});

describe('Redis store', () => {
  it('uses the in-memory store when REDIS_URL is not configured', () => {
    expect(createStore('x')).toBeUndefined();
  });

  it('namespaces keys per limiter', () => {
    mockRedis.isConfigured.mockReturnValue(true);
    const store = createStore('auth') as unknown as { prefix: string };
    expect(store.prefix).toBe('rl:auth:');
  });

  it('fails open when Redis is unavailable', async () => {
    mockRedis.isConfigured.mockReturnValue(true);
    mockRedis.sendCommand.mockRejectedValue(new Error('Redis is not available'));

    const app = appWith(
      createRateLimiter({ name: 't-open', windowMs: 60_000, max: 1, enforceInTests: true })
    );

    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/')).status).toBe(200);
    }
    expect(mockRedis.sendCommand).toHaveBeenCalled();
  });

  it('retries loading scripts after Redis recovers', async () => {
    mockRedis.isConfigured.mockReturnValue(true);
    mockRedis.sendCommand.mockRejectedValue(new Error('Redis is not available'));
    const store = createStore('t-recover') as unknown as {
      init: (o: { windowMs: number }) => Promise<void>;
      increment: (k: string) => Promise<{ totalHits: number }>;
    };

    // init must not throw while Redis is down.
    await expect(store.init({ windowMs: 60_000 })).resolves.toBeUndefined();

    mockRedis.sendCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'SCRIPT') return 'sha';
      return [3, 5000];
    });

    await expect(store.increment('k')).resolves.toMatchObject({ totalHits: 3 });
    expect(mockRedis.sendCommand).toHaveBeenCalledWith(expect.arrayContaining(['EVALSHA', 'sha']));
  });
});
