import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';

const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
  isOpen: true,
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

jest.mock('../../../db', () => ({
  db: {
    query: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue(true),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../../contracts/assets', () => ({
  issueAsset: jest.fn().mockResolvedValue('tx-hash'),
}));

describe('Rate Limiting', () => {
  let app: any;

  beforeAll(async () => {
    // Override NODE_ENV to test rate limit
    process.env.NODE_ENV = 'production';
    
    // We must isolate modules so `app` and `rateLimit` get re-evaluated with NODE_ENV='production'
    const appModule = await import('../../../app');
    app = appModule.default;
  });

  afterAll(() => {
    process.env.NODE_ENV = 'test';
  });

  it('rate limits issue endpoint', async () => {
    const issuerKeypair = Keypair.random();
    const distributorKeypair = Keypair.random();

    const payload = {
      issuerSecret: issuerKeypair.secret(),
      assetCode: 'COOP123',
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '1000',
    };

    // 1-3 allowed
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/v1/tokens/issue')
        .set('Authorization', 'Bearer user1')
        .send(payload);
      // Wait, because we didn't mock db in this isolated module context, it might fail with 500, but NOT 429.
      expect(res.status).not.toBe(429);
    }

    // 4th should be 429
    const res429 = await request(app).post('/api/v1/tokens/issue')
      .set('Authorization', 'Bearer user1')
      .send(payload);
    expect(res429.status).toBe(429);

    // Another user should be allowed
    const resOther = await request(app).post('/api/v1/tokens/issue')
      .set('Authorization', 'Bearer user2')
      .send(payload);
    expect(resOther.status).not.toBe(429);
  });
});
