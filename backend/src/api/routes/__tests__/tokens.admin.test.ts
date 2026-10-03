import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { resetAdminAddressCache } from '../../middleware/auth';
import { createSessionToken } from '../../utils/sessionToken';

jest.mock('../../../db', () => ({
  db: {
    query: jest.fn(),
    ping: jest.fn(),
  },
}));

const mockQuery = db.query as jest.Mock;

const ADMIN = Keypair.random().publicKey();
const OUTSIDER = Keypair.random().publicKey();

/** Bearer header for an address, as POST /api/v1/auth/verify would mint. */
function authHeader(address: string): string {
  return `Bearer ${createSessionToken(address).token}`;
}

describe('GET /api/v1/tokens (admin endpoint)', () => {
  const originalAdmins = process.env.ADMIN_ADDRESSES;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.ADMIN_ADDRESSES = ADMIN;
    resetAdminAddressCache();
  });

  afterAll(() => {
    if (originalAdmins === undefined) delete process.env.ADMIN_ADDRESSES;
    else process.env.ADMIN_ADDRESSES = originalAdmins;
    resetAdminAddressCache();
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/v1/tokens');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ data: null, error: 'Authentication required' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an authenticated address that is not an operator', async () => {
    const response = await request(app)
      .get('/api/v1/tokens')
      .set('Authorization', authHeader(OUTSIDER));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ data: null, error: 'Requires operator privileges' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects every address when ADMIN_ADDRESSES is unset', async () => {
    delete process.env.ADMIN_ADDRESSES;
    resetAdminAddressCache();

    const response = await request(app)
      .get('/api/v1/tokens')
      .set('Authorization', authHeader(ADMIN));

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns paginated tokens with community names', async () => {
    const tokens = [
      {
        id: 'token-1',
        community_id: 'comm-1',
        asset_code: 'ECO',
        asset_issuer: Keypair.random().publicKey(),
        distributor_address: Keypair.random().publicKey(),
        total_supply: '1000.0000000',
        name: 'Eco Token',
        description: 'Community ecological token',
        icon_url: 'https://example.com/icon.png',
        decimals: 7,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        community_name: 'EcoDAO',
      },
    ];

    mockQuery
      .mockResolvedValueOnce([{ count: 1 }]) // COUNT query
      .mockResolvedValueOnce(tokens); // SELECT query

    const response = await request(app)
      .get('/api/v1/tokens')
      .set('Authorization', authHeader(ADMIN));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(tokens);
    expect(response.body.meta).toEqual({
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
      offset: 0,
    });

    expect(mockQuery).toHaveBeenCalledWith('SELECT COUNT(*)::int AS count FROM tokens');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN communities c ON t.community_id = c.id'),
      [20, 0]
    );
  });

  it('supports pagination parameters', async () => {
    mockQuery.mockResolvedValueOnce([{ count: 25 }]).mockResolvedValueOnce([]);

    const response = await request(app)
      .get('/api/v1/tokens?page=2&limit=10')
      .set('Authorization', authHeader(ADMIN));

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      total: 25,
      page: 2,
      limit: 10,
      pages: 3,
      offset: 10,
    });

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1 OFFSET $2'), [10, 10]);
  });

  it('supports sorting by different columns', async () => {
    mockQuery.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);

    const response = await request(app)
      .get('/api/v1/tokens?sortBy=name&order=asc')
      .set('Authorization', authHeader(ADMIN));

    expect(response.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY t.name ASC'), [20, 0]);
  });

  it('validates query parameters and rejects invalid values', async () => {
    const response = await request(app)
      .get('/api/v1/tokens?page=0&limit=101')
      .set('Authorization', authHeader(ADMIN));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid query parameters');
    expect(response.body.meta.errors).toBeDefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns empty list when no tokens exist', async () => {
    mockQuery.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);

    const response = await request(app)
      .get('/api/v1/tokens')
      .set('Authorization', authHeader(ADMIN));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      pages: 0,
      offset: 0,
    });
  });

  it('handles database errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

    const response = await request(app)
      .get('/api/v1/tokens')
      .set('Authorization', authHeader(ADMIN));

    expect(response.status).toBe(500);
  });
});
