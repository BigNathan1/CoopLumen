/**
 * Integration test: two independent limiter instances (standing in for two
 * backend instances) must share one counter through a real Redis server.
 * Skipped automatically when REDIS_URL is not set.
 */
import express, { type Application } from 'express';
import request from 'supertest';
import { redisCache } from '../../../cache/redis';
import { createRateLimiter } from '../rateLimit';

const RUN = Boolean(process.env.REDIS_URL);
const describeIf = RUN ? describe : describe.skip;

const instance = (name: string, max: number): Application => {
  const app = express();
  app.set('trust proxy', true);
  app.use(createRateLimiter({ name, windowMs: 60_000, max, enforceInTests: true }));
  app.get('/', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

describeIf('rate limit store (Redis integration)', () => {
  afterAll(async () => {
    await redisCache.disconnect();
  });

  it('enforces one limit across separate instances', async () => {
    const name = `it-${Date.now()}`;
    const a = instance(name, 3);
    const b = instance(name, 3);
    const ip = '198.51.100.7';

    expect((await request(a).get('/').set('X-Forwarded-For', ip)).status).toBe(200);
    expect((await request(b).get('/').set('X-Forwarded-For', ip)).status).toBe(200);
    expect((await request(a).get('/').set('X-Forwarded-For', ip)).status).toBe(200);
    expect((await request(b).get('/').set('X-Forwarded-For', ip)).status).toBe(429);
    expect((await request(a).get('/').set('X-Forwarded-For', ip)).status).toBe(429);
  });

  it('keeps limiters with different names independent', async () => {
    const suffix = Date.now();
    const a = instance(`it-a-${suffix}`, 1);
    const b = instance(`it-b-${suffix}`, 1);
    const ip = '198.51.100.8';

    expect((await request(a).get('/').set('X-Forwarded-For', ip)).status).toBe(200);
    expect((await request(b).get('/').set('X-Forwarded-For', ip)).status).toBe(200);
  });
});
