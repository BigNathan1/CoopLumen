import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
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
const validKey = Keypair.random().publicKey();

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/communities', () => {
  it('returns an empty list with pagination meta when none exist', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 0 }]) // COUNT
      .mockResolvedValueOnce([]); // SELECT
    const res = await request(app).get('/api/communities');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });

  it('returns communities with pagination meta', async () => {
    const community = {
      id: 'uuid-1',
      name: 'TestDAO',
      asset_code: 'TDAO',
      asset_issuer: validKey,
      issuer_public_key: validKey,
      description: null,
    };
    mockDb.query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([community]);
    const res = await request(app).get('/api/communities?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('TestDAO');
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 10, pages: 1 });
  });
});

describe('GET /api/communities/:id', () => {
  it('returns 404 when not found', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/communities/uuid-x');
    expect(res.status).toBe(404);
  });

  it('enriches the community with member count, tokens, and stats', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ id: 'uuid-1', name: 'TestDAO', issuer_public_key: validKey }]) // community
      .mockResolvedValueOnce([{ count: 3 }]) // member count
      .mockResolvedValueOnce([{ asset_code: 'TDAO', total_supply: '100.0000000' }]) // tokens
      .mockResolvedValueOnce([{ count: 5 }]); // tx count
    const res = await request(app).get('/api/communities/uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.data.member_count).toBe(3);
    expect(res.body.data.tokens).toHaveLength(1);
    expect(res.body.data.stats).toEqual({ total_transactions: 5, total_token_supply: 100 });
  });
});

describe('POST /api/communities', () => {
  it('returns 400 on invalid payload', async () => {
    const res = await request(app).post('/api/communities').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('returns 400 on a structurally invalid Stellar key', async () => {
    const res = await request(app).post('/api/communities').send({
      name: 'EcoDAO',
      issuerPublicKey: 'not-a-key',
      assetCode: 'ECO',
      assetIssuer: 'not-a-key',
    });
    expect(res.status).toBe(400);
  });

  it('creates a community with a valid payload', async () => {
    const community = { id: 'uuid-1', name: 'EcoDAO', asset_code: 'ECO' };
    mockDb.query.mockResolvedValueOnce([]); // name uniqueness
    mockDb.transaction.mockResolvedValueOnce(community);

    const res = await request(app).post('/api/communities').send({
      name: 'EcoDAO',
      description: 'An eco community',
      issuerPublicKey: validKey,
      assetCode: 'ECO',
      assetIssuer: validKey,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('EcoDAO');
  });

  it('returns 409 on duplicate name', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: 'existing' }]);
    const res = await request(app).post('/api/communities').send({
      name: 'EcoDAO',
      issuerPublicKey: validKey,
      assetCode: 'ECO',
      assetIssuer: validKey,
    });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/communities/:id', () => {
  it('returns 404 when the community does not exist', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).put('/api/communities/uuid-x').send({ name: 'New Name' });
    expect(res.status).toBe(404);
  });

  it('updates an existing community', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ id: 'uuid-1', name: 'Old' }]) // exists
      .mockResolvedValueOnce([]); // duplicate-name check
    mockDb.transaction.mockResolvedValueOnce({ id: 'uuid-1', name: 'New Name' });
    const res = await request(app).put('/api/communities/uuid-1').send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });
});

describe('DELETE /api/communities/:id', () => {
  it('soft-deletes a community', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: 'uuid-1' }]);
    const res = await request(app).delete('/api/communities/uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'uuid-1', deleted: true });
  });

  it('returns 404 when nothing was deleted', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).delete('/api/communities/uuid-x');
    expect(res.status).toBe(404);
  });
});

describe('members', () => {
  it('lists members with pagination meta', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ stellar_address: validKey, role: 'member', joined_at: 'now' }]);
    const res = await request(app).get('/api/communities/uuid-1/members');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('rejects an invalid Stellar address on add', async () => {
    const res = await request(app)
      .post('/api/communities/uuid-1/members')
      .send({ stellarAddress: 'bad' });
    expect(res.status).toBe(400);
  });

  it('adds a valid member', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ id: 'uuid-1' }]) // community exists
      .mockResolvedValueOnce([]); // insert
    const res = await request(app)
      .post('/api/communities/uuid-1/members')
      .send({ stellarAddress: validKey, role: 'treasurer' });
    expect(res.status).toBe(201);
  });

  it('updates a member role', async () => {
    mockDb.query.mockResolvedValueOnce([{ stellar_address: validKey, role: 'admin' }]);
    const res = await request(app)
      .put(`/api/communities/uuid-1/members/${validKey}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('soft-removes a member', async () => {
    mockDb.query.mockResolvedValueOnce([{ stellar_address: validKey }]);
    const res = await request(app).delete(`/api/communities/uuid-1/members/${validKey}`);
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });
});
