import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { createSessionToken } from '../../utils/sessionToken';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const validKey = Keypair.random().publicKey();

function authHeader(address: string): string {
  return `Bearer ${createSessionToken(address).token}`;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/communities', () => {
  it('returns an empty list with pagination meta when none exist', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 0 }]) // COUNT
      .mockResolvedValueOnce([]); // SELECT
    const res = await request(app).get('/api/v1/communities');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0, offset: 0 });
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
    const res = await request(app).get('/api/v1/communities?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('TestDAO');
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 10, pages: 1, offset: 0 });
  });

  it('returns communities with pagination meta using offset instead of page', async () => {
    const community = {
      id: 'uuid-2',
      name: 'EcoDAO',
      asset_code: 'ECO',
      asset_issuer: validKey,
      issuer_public_key: validKey,
      description: null,
    };
    mockDb.query.mockResolvedValueOnce([{ count: 21 }]).mockResolvedValueOnce([community]);
    const res = await request(app).get('/api/v1/communities?offset=20&limit=20');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ total: 21, page: 2, limit: 20, pages: 2, offset: 20 });
  });

  it('rejects invalid pagination parameters with 400', async () => {
    const res = await request(app).get('/api/v1/communities?offset=-5');
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toBeDefined();
  });
});

describe('GET /api/v1/communities/search', () => {
  it('returns 400 when "q" is missing', async () => {
    const res = await request(app).get('/api/v1/communities/search');
    expect(res.status).toBe(400);
  });

  it('returns 400 when "q" is blank', async () => {
    const res = await request(app).get('/api/v1/communities/search?q=%20');
    expect(res.status).toBe(400);
  });

  it('returns matching communities with pagination meta', async () => {
    const community = {
      id: 'uuid-1',
      name: 'EcoDAO',
      asset_code: 'ECO',
      asset_issuer: validKey,
      issuer_public_key: validKey,
      description: 'An eco community',
    };
    mockDb.query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([community]);
    const res = await request(app).get('/api/v1/communities/search?q=eco');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('EcoDAO');
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 20, pages: 1, offset: 0 });
  });
});

describe('GET /api/v1/communities/:id', () => {
  it('returns 404 when not found', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/communities/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ data: null, error: 'Community not found' });
  });

  it('enriches the community with tokens, settings, and statistics', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'TestDAO',
          issuer_public_key: validKey,
          asset_code: 'TDAO',
          asset_issuer: validKey,
          description: null,
          avatar_url: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted_at: null,
          settings: { quorum: 0.6 },
          member_count: 3,
        },
      ]) // community
      .mockResolvedValueOnce([{ asset_code: 'TDAO', total_supply: '100.0000000' }]) // tokens
      .mockResolvedValueOnce([{ total_transactions: 5, total_token_supply: '100.0000000' }]); // stats
    const res = await request(app).get('/api/v1/communities/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    expect(res.body.data.community.member_count).toBe(3);
    expect(res.body.data.community.settings).toEqual({ quorum: 0.6 });
    expect(res.body.data.community.tokens).toHaveLength(1);
    expect(res.body.data.statistics).toEqual({ totalTransactions: 5, totalTokenSupply: 100 });
  });

  it('returns zero statistics when a community has no tokens or transactions', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'ZeroDAO',
          issuer_public_key: validKey,
          asset_code: 'ZERO',
          asset_issuer: validKey,
          description: null,
          avatar_url: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted_at: null,
          settings: {},
          member_count: 0,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total_transactions: 0, total_token_supply: '0' }]);

    const res = await request(app).get('/api/v1/communities/11111111-1111-4111-8111-111111111111');

    expect(res.status).toBe(200);
    expect(res.body.data.statistics).toEqual({ totalTransactions: 0, totalTokenSupply: 0 });
  });
});

describe('POST /api/v1/communities', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/v1/communities').send({
      name: 'EcoDAO',
      issuerPublicKey: validKey,
      assetCode: 'ECO',
      assetIssuer: validKey,
    });
    expect(res.status).toBe(401);
  });

  it('rejects a caller whose address does not match issuerPublicKey', async () => {
    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(Keypair.random().publicKey()))
      .send({
        name: 'EcoDAO',
        issuerPublicKey: validKey,
        assetCode: 'ECO',
        assetIssuer: validKey,
      });
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid payload', async () => {
    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(validKey))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toBeDefined();
  });

  it('returns 400 on a structurally invalid Stellar key', async () => {
    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(validKey))
      .send({
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

    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(validKey))
      .send({
        name: 'EcoDAO',
        description: 'An eco community',
        issuerPublicKey: validKey,
        assetCode: 'ECO',
        assetIssuer: validKey,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('EcoDAO');
    expect(res.body.data.settings).toEqual({});
  });

  it('records a community_created transactions_log entry in the same transaction as the insert', async () => {
    const community = { id: 'uuid-1', name: 'EcoDAO', asset_code: 'ECO' };
    mockDb.query.mockResolvedValueOnce([]); // name uniqueness check

    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [community] }) // INSERT INTO communities
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO members
      .mockResolvedValueOnce({ rows: [] }); // INSERT INTO transactions_log
    mockDb.transaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery } as never));

    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(validKey))
      .send({
        name: 'EcoDAO',
        issuerPublicKey: validKey,
        assetCode: 'ECO',
        assetIssuer: validKey,
      });

    expect(res.status).toBe(201);
    expect(clientQuery).toHaveBeenCalledTimes(3);

    const [logSql, logParams] = clientQuery.mock.calls[2] as [string, unknown[]];
    expect(logSql).toMatch(/INSERT INTO transactions_log/);
    expect(logSql).toMatch(/'community_created'/);
    expect(logParams[0]).toBe(community.id);
    expect(logParams[1]).toBe(validKey);
    expect(JSON.parse(logParams[2] as string)).toEqual({
      name: 'EcoDAO',
      asset_code: 'ECO',
    });
  });

  it('returns 409 on duplicate name', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: 'existing' }]);
    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(validKey))
      .send({
        name: 'EcoDAO',
        issuerPublicKey: validKey,
        assetCode: 'ECO',
        assetIssuer: validKey,
      });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      data: null,
      error: {
        code: 'COMMUNITY_NAME_EXISTS',
        message: 'A community with this name already exists.',
      },
    });
  });

  it('returns 409 on a duplicate name match after normalization', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: 'existing' }]);
    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(validKey))
      .send({
        name: '  ecodao  ',
        issuerPublicKey: validKey,
        assetCode: 'ECO',
        assetIssuer: validKey,
      });
    expect(res.status).toBe(409);
  });

  it('returns a sanitized 500 when community creation fails in the database', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    mockDb.transaction.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint')
    );

    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(validKey))
      .send({
        name: 'EcoDAO',
        issuerPublicKey: validKey,
        assetCode: 'ECO',
        assetIssuer: validKey,
      });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      data: null,
      error: {
        code: 'COMMUNITY_CREATE_FAILED',
        message: 'Unable to create community.',
      },
    });
  });
});

describe('PUT /api/v1/communities/:id', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .put('/api/v1/communities/11111111-1111-4111-8111-111111111111')
      .send({ name: 'New Name' });
    expect(res.status).toBe(401);
  });

  it('rejects a caller without an admin/treasurer role', async () => {
    mockDb.query.mockResolvedValueOnce([]); // no membership row
    const res = await request(app)
      .put('/api/v1/communities/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authHeader(validKey))
      .send({ name: 'New Name' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the community does not exist', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }]) // role check
      .mockResolvedValueOnce([]); // community lookup
    const res = await request(app)
      .put('/api/v1/communities/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authHeader(validKey))
      .send({ name: 'New Name' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ data: null, error: 'Community not found' });
  });

  it('rejects an invalid community id', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const res = await request(app)
      .put('/api/v1/communities/not-a-uuid')
      .set('Authorization', authHeader(validKey))
      .send({ name: 'New Name' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects an empty update payload', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const res = await request(app)
      .put('/api/v1/communities/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authHeader(validKey))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'requestBody',
          message: 'At least one of name, description, or settings must be provided',
        }),
      ])
    );
  });

  it('updates the community name', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }]) // role check
      .mockResolvedValueOnce([{ id: 'uuid-1', name: 'Old', settings: {} }]) // exists
      .mockResolvedValueOnce([]); // duplicate-name check
    mockDb.transaction.mockResolvedValueOnce({ id: 'uuid-1', name: 'New Name', settings: {} });
    const res = await request(app)
      .put('/api/v1/communities/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authHeader(validKey))
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });

  it('updates the community description', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ role: 'treasurer' }])
      .mockResolvedValueOnce([{ id: 'uuid-1', name: 'Old', settings: {} }]);
    mockDb.transaction.mockResolvedValueOnce({
      id: 'uuid-1',
      name: 'Old',
      description: 'Updated description',
      settings: {},
    });

    const res = await request(app)
      .put('/api/v1/communities/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authHeader(validKey))
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('Updated description');
  });

  it('updates the community settings', async () => {
    const settings = { loanLimit: 1500, quorum: 0.75 };
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([{ id: 'uuid-1', name: 'Old', settings: { quorum: 0.6 } }]);
    mockDb.transaction.mockResolvedValueOnce({
      id: 'uuid-1',
      name: 'Old',
      description: 'Desc',
      settings,
    });

    const res = await request(app)
      .put('/api/v1/communities/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authHeader(validKey))
      .send({ settings });

    expect(res.status).toBe(200);
    expect(res.body.data.settings).toEqual(settings);
  });

  it('returns 409 when updating to a duplicate name', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([{ id: 'uuid-1', name: 'Old', settings: {} }])
      .mockResolvedValueOnce([{ id: 'uuid-2' }]);

    const res = await request(app)
      .put('/api/v1/communities/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authHeader(validKey))
      .send({ name: 'Existing DAO' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COMMUNITY_NAME_EXISTS');
  });
});

describe('DELETE /api/v1/communities/:id', () => {
  const communityId = '11111111-1111-4111-8111-111111111111';

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).delete(`/api/v1/communities/${communityId}`);
    expect(res.status).toBe(401);
  });

  it('rejects a caller who is not a community admin', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'member' }]);
    const res = await request(app)
      .delete(`/api/v1/communities/${communityId}`)
      .set('Authorization', authHeader(validKey));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a community', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([{ id: communityId }]);
    const res = await request(app)
      .delete(`/api/v1/communities/${communityId}`)
      .set('Authorization', authHeader(validKey));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: communityId, deleted: true });
  });

  it('returns 404 when nothing was deleted', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]).mockResolvedValueOnce([]);
    const res = await request(app)
      .delete('/api/v1/communities/22222222-2222-4222-8222-222222222222')
      .set('Authorization', authHeader(validKey));
    expect(res.status).toBe(404);
  });

  it('rejects an invalid community UUID', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const res = await request(app)
      .delete('/api/v1/communities/not-a-uuid')
      .set('Authorization', authHeader(validKey));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'id' })])
    );
  });
});

describe('members', () => {
  it('lists members with pagination meta', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ stellar_address: validKey, role: 'member', joined_at: 'now' }]);
    const res = await request(app).get('/api/v1/communities/uuid-1/members');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('rejects adding a member without an admin role', async () => {
    mockDb.query.mockResolvedValueOnce([]); // no membership row
    const res = await request(app)
      .post('/api/v1/communities/uuid-1/members')
      .set('Authorization', authHeader(validKey))
      .send({ stellarAddress: validKey, role: 'treasurer' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid Stellar address on add', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const res = await request(app)
      .post('/api/v1/communities/uuid-1/members')
      .set('Authorization', authHeader(validKey))
      .send({ stellarAddress: 'bad' });
    expect(res.status).toBe(400);
  });

  it('adds a valid member', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }]) // role check
      .mockResolvedValueOnce([{ id: 'uuid-1' }]) // community exists
      .mockResolvedValueOnce([
        { stellar_address: validKey, role: 'treasurer', joined_at: '2024-01-01T00:00:00Z' },
      ]); // insert
    const res = await request(app)
      .post('/api/v1/communities/uuid-1/members')
      .set('Authorization', authHeader(validKey))
      .send({ stellarAddress: validKey, role: 'treasurer' });
    expect(res.status).toBe(201);
    expect(res.body.data.stellar_address).toBe(validKey);
    expect(res.body.data.role).toBe('treasurer');
  });

  it('rejects a role change without an admin role', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app)
      .put(`/api/v1/communities/uuid-1/members/${validKey}`)
      .set('Authorization', authHeader(validKey))
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('updates a member role', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([
        { stellar_address: validKey, role: 'admin', joined_at: '2024-01-01T00:00:00Z' },
      ]);
    const res = await request(app)
      .put(`/api/v1/communities/uuid-1/members/${validKey}`)
      .set('Authorization', authHeader(validKey))
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
    expect(res.body.data.joined_at).toBe('2024-01-01T00:00:00Z');
  });

  it('rejects an invalid Stellar address in path parameter for update', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const res = await request(app)
      .put('/api/v1/communities/uuid-1/members/invalid-address')
      .set('Authorization', authHeader(validKey))
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('lets a member remove themselves', async () => {
    mockDb.query.mockResolvedValueOnce([{ stellar_address: validKey }]);
    const res = await request(app)
      .delete(`/api/v1/communities/uuid-1/members/${validKey}`)
      .set('Authorization', authHeader(validKey));
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });

  it('rejects removing another member without an admin role', async () => {
    const other = Keypair.random().publicKey();
    mockDb.query.mockResolvedValueOnce([]); // caller's role lookup: not a member
    const res = await request(app)
      .delete(`/api/v1/communities/uuid-1/members/${other}`)
      .set('Authorization', authHeader(validKey));
    expect(res.status).toBe(403);
  });

  it('lets an admin remove another member', async () => {
    const other = Keypair.random().publicKey();
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }]) // caller's role lookup
      .mockResolvedValueOnce([{ stellar_address: other }]);
    const res = await request(app)
      .delete(`/api/v1/communities/uuid-1/members/${other}`)
      .set('Authorization', authHeader(validKey));
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });

  it('rejects an invalid Stellar address in path parameter for delete', async () => {
    const res = await request(app)
      .delete('/api/v1/communities/uuid-1/members/invalid-address')
      .set('Authorization', authHeader(validKey));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid Stellar address in path parameter for get', async () => {
    const res = await request(app).get('/api/v1/communities/uuid-1/members/invalid-address');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/communities/:id/avatar', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/communities/uuid-1/avatar')
      .send({ avatarUrl: 'https://cdn.example.com/eco.png' });
    expect(res.status).toBe(401);
  });

  it('rejects a caller without an admin/treasurer role', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/api/v1/communities/uuid-1/avatar')
      .set('Authorization', authHeader(validKey))
      .send({ avatarUrl: 'https://cdn.example.com/eco.png' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid avatar URL', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const res = await request(app)
      .post('/api/v1/communities/uuid-1/avatar')
      .set('Authorization', authHeader(validKey))
      .send({ avatarUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('sets the avatar URL', async () => {
    const avatarUrl = 'https://cdn.example.com/eco.png';
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([{ id: 'uuid-1', avatar_url: avatarUrl }]);
    const res = await request(app)
      .post('/api/v1/communities/uuid-1/avatar')
      .set('Authorization', authHeader(validKey))
      .send({ avatarUrl });
    expect(res.status).toBe(200);
    expect(res.body.data.avatar_url).toBe(avatarUrl);
  });

  it('returns 404 when the community does not exist', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]).mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/api/v1/communities/uuid-x/avatar')
      .set('Authorization', authHeader(validKey))
      .send({ avatarUrl: 'https://cdn.example.com/x.png' });
    expect(res.status).toBe(404);
  });
});
