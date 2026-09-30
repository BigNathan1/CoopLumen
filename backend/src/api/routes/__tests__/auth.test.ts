import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { verifySessionToken } from '../../utils/sessionToken';
import { REFRESH_COOKIE_NAME, resetRefreshTokens } from '../../utils/refreshToken';
import { AUTH_COOKIE_NAME } from '../../utils/authCookie';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

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
