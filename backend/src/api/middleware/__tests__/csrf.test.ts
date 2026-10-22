import request from 'supertest';
import express, { Request, Response } from 'express';
import { csrfProtection } from '../csrf';
import {
  generateCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  validateCsrfToken,
} from '../../utils/csrf';
import { AUTH_COOKIE_NAME } from '../../utils/authCookie';
import app from '../../../app';

describe('CSRF Utilities & Middleware', () => {
  describe('Token validation', () => {
    it('generates random hex tokens of correct length', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
    });

    it('validates matching tokens successfully', () => {
      const token = generateCsrfToken();
      expect(validateCsrfToken(token, token)).toBe(true);
    });

    it('rejects mismatched or invalid tokens', () => {
      const token = generateCsrfToken();
      expect(validateCsrfToken(token, 'different-token')).toBe(false);
      expect(validateCsrfToken(token, null)).toBe(false);
      expect(validateCsrfToken(null, token)).toBe(false);
      expect(validateCsrfToken(null, null)).toBe(false);
    });
  });

  describe('csrfProtection middleware', () => {
    let testApp: express.Express;

    beforeEach(() => {
      testApp = express();
      testApp.use(express.json());
      testApp.use(csrfProtection);
      testApp.get('/test', (_req: Request, res: Response) => {
        res.json({ ok: true });
      });
      testApp.post('/test', (_req: Request, res: Response) => {
        res.json({ ok: true });
      });
    });

    it('allows safe methods (GET) without CSRF tokens', async () => {
      const res = await request(testApp).get('/test');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('allows non-cookie POST requests (pure Bearer auth / API clients)', async () => {
      const res = await request(testApp).post('/test').send({ data: 'hello' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('rejects POST requests with session cookie but missing CSRF header', async () => {
      const res = await request(testApp)
        .post('/test')
        .set('Cookie', [`${AUTH_COOKIE_NAME}=test-session; ${CSRF_COOKIE_NAME}=valid-token`])
        .send({ data: 'hello' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        data: null,
        error: 'Invalid or missing CSRF token',
      });
    });

    it('rejects POST requests with mismatched CSRF header and cookie', async () => {
      const res = await request(testApp)
        .post('/test')
        .set('Cookie', [`${AUTH_COOKIE_NAME}=test-session; ${CSRF_COOKIE_NAME}=valid-token`])
        .set(CSRF_HEADER_NAME, 'wrong-token')
        .send({ data: 'hello' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        data: null,
        error: 'Invalid or missing CSRF token',
      });
    });

    it('allows POST requests when session cookie has matching CSRF token and header', async () => {
      const token = generateCsrfToken();
      const res = await request(testApp)
        .post('/test')
        .set('Cookie', [`${AUTH_COOKIE_NAME}=test-session; ${CSRF_COOKIE_NAME}=${token}`])
        .set(CSRF_HEADER_NAME, token)
        .send({ data: 'hello' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('GET /api/v1/auth/csrf route in app', () => {
    it('returns a new CSRF token and sets the cookie', async () => {
      const res = await request(app).get('/api/v1/auth/csrf');

      expect(res.status).toBe(200);
      expect(res.body.data.csrfToken).toBeDefined();
      expect(res.body.data.csrfToken).toHaveLength(64);

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;
      expect(cookieStr).toContain(CSRF_COOKIE_NAME);
    });
  });
});
