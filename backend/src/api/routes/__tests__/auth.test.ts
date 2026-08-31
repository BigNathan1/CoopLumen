import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { verifySessionToken } from '../../utils/sessionToken';

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

    const challengeRes = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };

    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address, challenge, signature: Buffer.from('not a real signature').toString('base64') });
    expect(res.status).toBe(401);
  });

  it('issues a valid session token for a correctly signed challenge', async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const challengeRes = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ address });
    const { challenge } = challengeRes.body.data as { challenge: string };

    const signature = keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    const res = await request(app).post('/api/v1/auth/verify').send({ address, challenge, signature });

    expect(res.status).toBe(200);
    expect(res.body.data.address).toBe(address);
    expect(typeof res.body.data.token).toBe('string');

    const payload = verifySessionToken(res.body.data.token as string);
    expect(payload?.address).toBe(address);
  });

  it('rejects reusing the same challenge twice (single use)', async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const challengeRes = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ address });
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
