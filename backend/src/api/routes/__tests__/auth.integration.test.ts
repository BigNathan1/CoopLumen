/**
 * End-to-end integration tests for the full wallet authentication and RBAC authorization flow.
 * Exercises: challenge generation -> Freighter key signing -> signature verification ->
 * JWT session token minting -> cookie & header injection -> RBAC community guards ->
 * refresh token rotation -> logout, plus exhaustive negative/unauthorized path tests and
 * credential secrecy hygiene checks.
 */

import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { Pool } from 'pg';
import app from '../../../app';
import { db } from '../../../db';
import { setupTestDatabase } from '../../../testing/setup';
import { teardownTestSuite } from '../../../testing/teardown';
import { AUTH_COOKIE_NAME } from '../../utils/authCookie';
import { REFRESH_COOKIE_NAME } from '../../utils/refreshToken';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../utils/csrf';

const RUN_INTEGRATION = Boolean(process.env.DATABASE_URL);
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

describeIntegration('Auth flow end-to-end (integration)', () => {
  let pool: Pool;
  let testCommunityId: string;
  const adminKeypair = Keypair.random();
  const memberKeypair = Keypair.random();
  const strangerKeypair = Keypair.random();

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { seeded } = await setupTestDatabase({ pool, seed: true });
    testCommunityId = seeded?.eco.id ?? '';

    // Register test admin and member for RBAC checks in the test community
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO members (community_id, stellar_address, role)
         VALUES ($1, $2, 'admin'), ($1, $3, 'member')
         ON CONFLICT (community_id, stellar_address) DO UPDATE
         SET role = EXCLUDED.role`,
        [testCommunityId, adminKeypair.publicKey(), memberKeypair.publicKey()]
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await teardownTestSuite({ pool, closePool: true });
    await db.end();
  });

  async function loginAs(
    keypair: Keypair
  ): Promise<{ token: string; sessionCookie: string; refreshCookie: string; csrfCookie: string }> {
    const address = keypair.publicKey();

    // 1. Request challenge
    const challengeRes = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ address })
      .expect(200);

    const challenge = challengeRes.body.data.challenge as string;
    expect(challenge).toContain(address);

    // 2. Sign challenge with Stellar Ed25519 private key
    const signature = keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    // 3. Verify challenge
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature })
      .expect(200);

    expect(verifyRes.body.data.address).toBe(address);
    expect(verifyRes.body.data.token).toBeDefined();

    const cookies = verifyRes.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies?.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`)) ?? '';
    const refreshCookie = cookies?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? '';
    const csrfCookie = cookies?.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`)) ?? '';

    return {
      token: verifyRes.body.data.token as string,
      sessionCookie,
      refreshCookie,
      csrfCookie,
    };
  }

  describe('Full authorized wallet login and protected access', () => {
    it('executes challenge -> signature -> verify -> session token minting', async () => {
      const { token, sessionCookie, refreshCookie } = await loginAs(adminKeypair);
      expect(token).toBeTruthy();
      expect(sessionCookie).toContain(AUTH_COOKIE_NAME);
      expect(refreshCookie).toContain(REFRESH_COOKIE_NAME);
    });

    it('allows write access to protected endpoint with Bearer token', async () => {
      const { token } = await loginAs(adminKeypair);
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `AuthDAO-${Date.now()}`,
          description: 'Protected community',
          issuerPublicKey: adminKeypair.publicKey(),
          assetCode: 'ADAO',
          assetIssuer: adminKeypair.publicKey(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toContain('AuthDAO');
    });

    it('rejects a cookie-authenticated write without the CSRF token', async () => {
      const { sessionCookie } = await loginAs(adminKeypair);

      const res = await request(app)
        .post('/api/v1/communities')
        .set('Cookie', sessionCookie.split(';')[0])
        .send({
          name: `NoCsrfDAO-${Date.now()}`,
          issuerPublicKey: adminKeypair.publicKey(),
          assetCode: 'NCSR',
          assetIssuer: adminKeypair.publicKey(),
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Invalid or missing CSRF token');
    });

    it('allows access to protected endpoint using session cookie', async () => {
      const { sessionCookie, csrfCookie } = await loginAs(adminKeypair);
      const cookieValue = sessionCookie.split(';')[0];
      const csrfPair = csrfCookie.split(';')[0];
      const csrfToken = decodeURIComponent(csrfPair.slice(csrfPair.indexOf('=') + 1));

      // Cookie auth needs the double-submit CSRF token: cookie plus header.
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Cookie', [cookieValue, csrfPair])
        .set(CSRF_HEADER_NAME, csrfToken)
        .send({
          name: `CookieDAO-${Date.now()}`,
          description: 'Protected community with cookie',
          issuerPublicKey: adminKeypair.publicKey(),
          assetCode: 'CDAO',
          assetIssuer: adminKeypair.publicKey(),
        });

      expect(res.status).toBe(201);
    });
  });

  describe('RBAC authorization guard integration', () => {
    it('grants community admin access to admin-only endpoint', async () => {
      const { token } = await loginAs(adminKeypair);

      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Updated by authorized admin' });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Updated by authorized admin');
    });

    it('denies regular community member access to admin-only endpoint with 403', async () => {
      const { token } = await loginAs(memberKeypair);

      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Unauthorized member edit attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Requires community role: admin');
    });

    it('denies outsider with valid token from accessing community endpoint with 403', async () => {
      const { token } = await loginAs(strangerKeypair);

      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Intruder edit attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Requires community role: admin');
    });
  });

  describe('Unauthorized and negative paths', () => {
    it('rejects unauthenticated requests to protected endpoints with 401', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .send({ name: 'UnauthenticatedDAO' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('rejects requests with forged/tampered session tokens with 401', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', 'Bearer invalid.tampered.token')
        .send({ name: 'TamperedDAO' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired session token');
    });

    it('rejects signature verification when signed by wrong private key', async () => {
      const challengeRes = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ address: adminKeypair.publicKey() });
      const challenge = challengeRes.body.data.challenge as string;

      // Signed by strangerKeypair instead of adminKeypair
      const forgedSignature = strangerKeypair
        .sign(Buffer.from(challenge, 'utf8'))
        .toString('base64');

      const res = await request(app).post('/api/v1/auth/verify').send({
        address: adminKeypair.publicKey(),
        challenge,
        signature: forgedSignature,
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Signature verification failed');
    });

    it('prevents challenge replay attacks', async () => {
      const address = adminKeypair.publicKey();
      const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
      const challenge = challengeRes.body.data.challenge as string;
      const signature = adminKeypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

      // First verify succeeds
      await request(app)
        .post('/api/v1/auth/verify')
        .send({ address, challenge, signature })
        .expect(200);

      // Replaying the same challenge fails immediately
      const replayRes = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address, challenge, signature });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error).toContain('No matching challenge');
    });
  });

  describe('Refresh token rotation and logout', () => {
    it('rotates refresh token and invalidates consumed refresh token', async () => {
      const { refreshCookie } = await loginAs(adminKeypair);
      const refreshCookieValue = refreshCookie.split(';')[0];

      // First refresh succeeds
      const firstRefreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookieValue)
        .expect(200);

      expect(firstRefreshRes.body.data.token).toBeDefined();

      // Replay of consumed refresh token is rejected
      const replayRefreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookieValue);

      expect(replayRefreshRes.status).toBe(401);
      expect(replayRefreshRes.body.error).toContain('Invalid or expired refresh token');
    });

    it('clears session cookies cleanly on logout', async () => {
      const res = await request(app).post('/api/v1/auth/logout').expect(200);
      expect(res.body.data.loggedOut).toBe(true);

      const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
      const sessionExpiry = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(sessionExpiry).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });
  });

  describe('Credential and secrecy hygiene', () => {
    it('never exposes private keys, secret seeds, or tokens in error responses', async () => {
      const badRequests = [
        request(app).post('/api/v1/auth/verify').send({ address: 'invalid' }),
        request(app).post('/api/v1/auth/verify').send({
          address: adminKeypair.publicKey(),
          challenge: 'bad',
          signature: 'bad',
        }),
        request(app).post('/api/v1/communities').set('Authorization', 'Bearer invalid-token'),
        request(app)
          .put(`/api/v1/communities/${testCommunityId}`)
          .set('Authorization', 'Bearer malformed'),
      ];

      const responses = await Promise.all(badRequests);
      for (const res of responses) {
        const payloadString = JSON.stringify(res.body);
        expect(payloadString).not.toMatch(/S[A-Z0-9]{55}/); // Stellar secret seed format
        expect(payloadString).not.toContain(adminKeypair.secret());
        expect(payloadString).not.toContain('SESSION_SECRET');
        expect(payloadString).not.toContain('stack');
      }
    });
  });
});

describe('Auth flow end-to-end (offline unit suite)', () => {
  const adminKeypair = Keypair.random();
  const strangerKeypair = Keypair.random();

  async function login(keypair: Keypair) {
    const address = keypair.publicKey();
    const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
    const challenge = challengeRes.body.data.challenge as string;
    const signature = keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature });
    const cookies = (verifyRes.headers['set-cookie'] as unknown as string[]) || [];
    const sessionCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`)) ?? '';
    const refreshCookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? '';
    return { token: verifyRes.body.data.token, sessionCookie, refreshCookie };
  }

  it('completes wallet sign-in flow and receives session token and httpOnly cookies', async () => {
    const { token, sessionCookie, refreshCookie } = await login(adminKeypair);
    expect(token).toBeDefined();
    expect(sessionCookie).toContain(AUTH_COOKIE_NAME);
    expect(refreshCookie).toContain(REFRESH_COOKIE_NAME);
  });

  it('rejects unauthenticated requests to protected endpoints with 401', async () => {
    const res = await request(app).post('/api/v1/communities').send({ name: 'NoAuth' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('rejects tampered Bearer tokens with 401', async () => {
    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', 'Bearer forged.bad.jwt')
      .send({ name: 'Tampered' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired session token');
  });

  it('rejects signature verification when signed by wrong private key with 401', async () => {
    const challengeRes = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ address: adminKeypair.publicKey() });
    const challenge = challengeRes.body.data.challenge as string;
    const badSignature = strangerKeypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    const res = await request(app).post('/api/v1/auth/verify').send({
      address: adminKeypair.publicKey(),
      challenge,
      signature: badSignature,
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Signature verification failed');
  });

  it('prevents challenge replay attacks', async () => {
    const address = adminKeypair.publicKey();
    const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
    const challenge = challengeRes.body.data.challenge as string;
    const signature = adminKeypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature })
      .expect(200);

    const replay = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toContain('No matching challenge');
  });

  it('rotates refresh token and rejects reuse of consumed refresh token', async () => {
    const { refreshCookie } = await login(adminKeypair);
    const cookieVal = refreshCookie.split(';')[0];

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieVal)
      .expect(200);
    expect(refreshRes.body.data.token).toBeDefined();

    const replayRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieVal);
    expect(replayRes.status).toBe(401);
  });

  it('clears session cookies cleanly on logout', async () => {
    const res = await request(app).post('/api/v1/auth/logout').expect(200);
    expect(res.body.data.loggedOut).toBe(true);
    const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
    const sessionCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
    expect(sessionCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('guarantees zero secret leaks in error payloads', async () => {
    const res = await request(app).post('/api/v1/auth/verify').send({
      address: adminKeypair.publicKey(),
      challenge: 'nonexistent',
      signature: 'bad',
    });
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/S[A-Z0-9]{55}/);
    expect(bodyStr).not.toContain(adminKeypair.secret());
    expect(bodyStr).not.toContain('stack');
  });
});
