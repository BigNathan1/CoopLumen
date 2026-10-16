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
const communityId = '11111111-1111-4111-8111-111111111111';
const adminKeypair = Keypair.random();
const memberKeypair = Keypair.random();
const targetKeypair = Keypair.random();

function authHeader(keypair: Keypair): string {
  return `Bearer ${createSessionToken(keypair.publicKey()).token}`;
}

describe('DELETE /api/v1/communities/:id/members/:address RBAC', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).delete(
      `/api/v1/communities/${communityId}/members/${targetKeypair.publicKey()}`
    );

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ data: null, error: 'Authentication required' });
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('rejects a caller who is only a member with 403', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'member' }]);

    const res = await request(app)
      .delete(`/api/v1/communities/${communityId}/members/${targetKeypair.publicKey()}`)
      .set('Authorization', authHeader(memberKeypair));

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Requires community role: admin');
  });

  it('rejects a caller who is a treasurer with 403', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'treasurer' }]);

    const res = await request(app)
      .delete(`/api/v1/communities/${communityId}/members/${targetKeypair.publicKey()}`)
      .set('Authorization', authHeader(memberKeypair));

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Requires community role: admin');
  });

  it('allows an admin to remove a member', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ role: 'admin' }]) // requireRole check
      .mockResolvedValueOnce([{ stellar_address: targetKeypair.publicKey() }]); // soft delete

    const res = await request(app)
      .delete(`/api/v1/communities/${communityId}/members/${targetKeypair.publicKey()}`)
      .set('Authorization', authHeader(adminKeypair));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      stellar_address: targetKeypair.publicKey(),
      removed: true,
    });
    expect(mockDb.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT role FROM members'),
      [communityId, adminKeypair.publicKey()]
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE members SET deleted_at = NOW()'),
      [communityId, targetKeypair.publicKey()]
    );
  });

  it('returns 404 when the member is not found or already removed', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]).mockResolvedValueOnce([]);

    const res = await request(app)
      .delete(`/api/v1/communities/${communityId}/members/${targetKeypair.publicKey()}`)
      .set('Authorization', authHeader(adminKeypair));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ data: null, error: 'Member not found' });
  });

  it('rejects an invalid Stellar address in the path parameter with 400', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);

    const res = await request(app)
      .delete(`/api/v1/communities/${communityId}/members/invalid-key`)
      .set('Authorization', authHeader(adminKeypair));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ data: null, error: 'Invalid Stellar address' });
  });
});
