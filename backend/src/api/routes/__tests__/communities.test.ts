import request from 'supertest';
import app from '../../../app';
import { db } from '../../../db';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

describe('GET /api/communities', () => {
  it('returns an empty array when no communities exist', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/communities');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns communities when they exist', async () => {
    const community = {
      id: 'uuid-1',
      name: 'TestDAO',
      asset_code: 'TDAO',
      asset_issuer: 'G'.repeat(56),
      issuer_public_key: 'G'.repeat(56),
      description: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockDb.query.mockResolvedValueOnce([community]);
    const res = await request(app).get('/api/communities');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('TestDAO');
  });
});

describe('POST /api/communities', () => {
  it('returns 400 on invalid payload', async () => {
    const res = await request(app).post('/api/communities').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('creates a community with valid payload', async () => {
    const validKey = 'G' + 'A'.repeat(55);
    const community = {
      id: 'uuid-1',
      name: 'EcoDAO',
      asset_code: 'ECO',
      asset_issuer: validKey,
      issuer_public_key: validKey,
      description: 'An eco community',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockDb.query
      .mockResolvedValueOnce([])        // name uniqueness check
      .mockResolvedValueOnce([community]); // insert

    const res = await request(app)
      .post('/api/communities')
      .send({
        name: 'EcoDAO',
        description: 'An eco community',
        issuerPublicKey: validKey,
        assetCode: 'ECO',
        assetIssuer: validKey,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('EcoDAO');
  });
});
