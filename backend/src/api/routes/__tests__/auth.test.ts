import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { verifySessionToken, createSessionToken } from '../../utils/sessionToken';
import { REFRESH_COOKIE_NAME, resetRefreshTokens } from '../../utils/refreshToken';
import { AUTH_COOKIE_NAME } from '../../utils/authCookie';
import { resetFailedAuthAttempts } from '../auth';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

describe('GET /api/v1/auth/challenge/:publicKey', () => {
  it('rejects an invalid Stellar address in the path', async () => {
    const res = await request(app).get('/api/v1/auth/challenge/not-a-key');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('issues a challenge for a valid public key path parameter', async () => {
    const address = Keypair.random().publicKey();
    const res = await request(app).get(`/api/v1/auth/challenge/${address}`);
    expect(res.status).toBe(200);
    expect(res.body.data.challenge).toEqual(expect.stringContaining(address));
  });
});

describe('POST /api/v1/auth/challenge', () => {
  it('rejects an invalid Stellar address', async () => {
    const res = await request(app).post('/api/v1/auth/challenge').send({ address: 'not-a-key' });
    expect(res.status).toBe(400);
  });

  it('issues a challenge referencing the address', async () => {
    const address = Keypair.random().publicKey();
    const res = await request(app).post('/api/v1/auth/challenge').send({ address });
    expect(res.status).toBe(200);
    expect(res.body.data.challenge).toEqual(expect.stringContaining(address));
  });

  it('issues a fresh, distinct challenge on each call', async () => {
    const address = Keypair.random().publicKey();
    const first = await request(app).post('/api/v1/auth/challenge').send({ address });
    const second = await request(app).post('/api/v1/auth/challenge').send({ address });
    expect(first.body.data.challenge).not.toBe(second.body.data.challenge);
  });
});

describe('POST /api/v1/auth/verify', () => {
  beforeEach(() => {
    resetFailedAuthAttempts();
  });

  it('rejects an invalid payload', async () => {
    const res = await request(app).post('/api/v1/auth/verify').send({});
    expect(res.status).toBe(400);
  });

  it('rejects a challenge that was never issued', async () => {
    const address = Keypair.random().publicKey();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge: 'made up', signature: 'abcd' });
    expect(res.status).toBe(401);
  });

  it('rejects a bad signature for a real challenge', async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };

    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({
        address,
        challenge,
        signature: Buffer.from('not a real signature').toString('base64'),
      });
    expect(res.status).toBe(401);
  });

  it('issues a valid session token for a correctly signed challenge', async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };

    const signature = keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature });

    expect(res.status).toBe(200);
    expect(res.body.data.address).toBe(address);
    expect(typeof res.body.data.token).toBe('string');

    const payload = verifySessionToken(res.body.data.token as string);
    expect(payload?.address).toBe(address);
  });

  it('sets the session token in an httpOnly, SameSite=Strict cookie', async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };
    const signature = keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature });

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
    expect(session).toBeDefined();
    expect(session).toEqual(expect.stringContaining('HttpOnly'));
    expect(session).toEqual(expect.stringContaining('SameSite=Strict'));
    expect(session).toEqual(expect.stringContaining('Path=/'));
    expect(session).toEqual(expect.stringContaining('Expires='));

    const cookieToken = decodeURIComponent(session!.split(';')[0].split('=')[1]);
    expect(cookieToken).toBe(res.body.data.token);
    expect(verifySessionToken(cookieToken)?.address).toBe(address);
  });

  it('does not set a cookie when verification fails', async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };

    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature: Buffer.from('nope').toString('base64') });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects reusing the same challenge twice (single use)', async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };
    const signature = keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    const first = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature });
    expect(second.status).toBe(401);
  });

  it('rejects verification when address does not match the challenge address', async () => {
    const keypairA = Keypair.random();
    const keypairB = Keypair.random();

    const challengeRes = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ address: keypairA.publicKey() });
    const { challenge } = challengeRes.body.data as { challenge: string };

    const signatureB = keypairB.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: keypairB.publicKey(), challenge, signature: signatureB });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No matching challenge for this address. Request a new one.');
  });

  it('does not leak private keys or server secrets in error envelopes', async () => {
    const address = Keypair.random().publicKey();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge: 'fake-challenge', signature: 'invalid-sig' });

    expect(res.status).toBe(401);
    expect(res.text).not.toMatch(/S[A-Z0-9]{55}/);
    expect(res.text).not.toMatch(/Bearer\s+[A-Za-z0-9-_=]+/);
  });

  it('tracks failed auth attempts per IP and blocks after 10 failures in 5 minutes', async () => {
    const ip = '198.51.100.42';
    const address = Keypair.random().publicKey();

    // Trigger 10 failures from this IP
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/auth/verify')
        .set('X-Forwarded-For', ip)
        .send({ address, challenge: `bad-challenge-${i}`, signature: 'invalid' });
      expect(res.status).toBe(401);
    }

    // 11th request should be blocked with 429
    const blockedRes = await request(app)
      .post('/api/v1/auth/verify')
      .set('X-Forwarded-For', ip)
      .send({ address, challenge: 'bad-challenge-11', signature: 'invalid' });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body).toEqual({
      data: null,
      error: 'Too many failed authentication attempts. Please try again later.',
    });

    // A different IP is not blocked
    const otherIpRes = await request(app)
      .post('/api/v1/auth/verify')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ address, challenge: 'bad-challenge-12', signature: 'invalid' });
    expect(otherIpRes.status).toBe(401);
  });

  it('clears failed attempt count after a successful login', async () => {
    const ip = '198.51.100.55';
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    // Trigger 9 failures (1 below threshold)
    for (let i = 0; i < 9; i++) {
      const res = await request(app)
        .post('/api/v1/auth/verify')
        .set('X-Forwarded-For', ip)
        .send({ address, challenge: `bad-${i}`, signature: 'bad' });
      expect(res.status).toBe(401);
    }

    // Perform successful authentication
    const challengeRes = await request(app)
      .post('/api/v1/auth/challenge')
      .set('X-Forwarded-For', ip)
      .send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };
    const signature = keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    const successRes = await request(app)
      .post('/api/v1/auth/verify')
      .set('X-Forwarded-For', ip)
      .send({ address, challenge, signature });
    expect(successRes.status).toBe(200);

    // Failures should have been cleared; one more failure should be 401, not 429
    const nextRes = await request(app)
      .post('/api/v1/auth/verify')
      .set('X-Forwarded-For', ip)
      .send({ address, challenge: 'bad-again', signature: 'bad' });
    expect(nextRes.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  function expiredSessionCookie(res: request.Response): string | undefined {
    const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
    return cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=;`));
  }

  it('expires the session cookie for a signed-in client', async () => {
    const { token } = createSessionToken(Keypair.random().publicKey());
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `${AUTH_COOKIE_NAME}=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { loggedOut: true } });

    const cleared = expiredSessionCookie(res);
    expect(cleared).toBeDefined();
    expect(cleared).toEqual(expect.stringContaining('Expires=Thu, 01 Jan 1970'));
    expect(cleared).toEqual(expect.stringContaining('HttpOnly'));
    expect(cleared).toEqual(expect.stringContaining('SameSite=Strict'));
    expect(cleared).toEqual(expect.stringContaining('Path=/'));
    expect(res.text).not.toContain(token);
  });

  it('is idempotent when no session cookie is sent', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(expiredSessionCookie(res)).toBeDefined();
  });

  it('succeeds even with a garbage cookie value and never echoes it', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `${AUTH_COOKIE_NAME}=not-a-real-token`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('not-a-real-token');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => resetRefreshTokens());

  async function signIn(): Promise<{ address: string; refreshCookie: string }> {
    const keypair = Keypair.random();
    const address = keypair.publicKey();
    const challengeRes = await request(app).post('/api/v1/auth/challenge').send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };
    const signature = keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature });
    return { address, refreshCookie: pickCookie(res, REFRESH_COOKIE_NAME) };
  }

  function pickCookie(res: request.Response, name: string): string {
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const found = cookies.find((c) => c.startsWith(`${name}=`));
    if (!found) throw new Error(`no ${name} cookie set`);
    return found;
  }

  it('sets an httpOnly refresh cookie scoped to the auth routes on verify', async () => {
    const { refreshCookie } = await signIn();
    expect(refreshCookie).toEqual(expect.stringContaining('HttpOnly'));
    expect(refreshCookie).toEqual(expect.stringContaining('SameSite=Strict'));
    expect(refreshCookie).toEqual(expect.stringContaining('Path=/api/v1/auth'));
  });

  it('rejects a request without a refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
  });

  it('rejects an unknown refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=forged`);
    expect(res.status).toBe(401);
  });

  it('issues a new session token and rotates the refresh token', async () => {
    const { address, refreshCookie } = await signIn();
    const cookieHeader = refreshCookie.split(';')[0];

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.address).toBe(address);
    expect(verifySessionToken(res.body.data.token as string)?.address).toBe(address);

    const sessionCookie = pickCookie(res, AUTH_COOKIE_NAME);
    expect(sessionCookie).toEqual(expect.stringContaining('HttpOnly'));
    const rotated = pickCookie(res, REFRESH_COOKIE_NAME);
    expect(rotated.split(';')[0]).not.toBe(cookieHeader);
  });

  it('rejects reuse of a refresh token that was already rotated', async () => {
    const { refreshCookie } = await signIn();
    const cookieHeader = refreshCookie.split(';')[0];

    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieHeader);
    expect(first.status).toBe(200);

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieHeader);
    expect(replay.status).toBe(401);
    expect(replay.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining(`${REFRESH_COOKIE_NAME}=;`)])
    );
  });
});
