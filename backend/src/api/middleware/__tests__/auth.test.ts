import { Request, Response } from 'express';
import { requireAuth, requireRole, requireCommunityRole, authenticateJWT } from '../auth';
import { AUTH_COOKIE_NAME } from '../../utils/authCookie';
import { createSessionToken } from '../../utils/sessionToken';
import { db } from '../../../db';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

function mockRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('authenticateJWT', () => {
  const address = 'GABC';

  it('rejects a request with neither cookie nor Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ data: null, error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid session cookie and sets req.auth', () => {
    const { token } = createSessionToken(address);
    const req = { headers: { cookie: `other=1; ${AUTH_COOKIE_NAME}=${token}` } } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toEqual({ address });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a tampered cookie token', () => {
    const { token } = createSessionToken(address);
    const req = { headers: { cookie: `${AUTH_COOKIE_NAME}=${token}x` } } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      data: null,
      error: 'Invalid or expired session token',
    });
    expect(next).not.toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it('rejects an expired cookie token', () => {
    const { token } = createSessionToken(address, -10);
    const req = { headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` } } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('ignores unrelated cookies', () => {
    const req = { headers: { cookie: 'session=abc; theme=dark' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('falls back to a Bearer token when there is no cookie', () => {
    const { token } = createSessionToken(address);
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toEqual({ address });
  });

  it('does not let a valid Bearer token rescue an invalid cookie', () => {
    const { token } = createSessionToken(address);
    const req = {
      headers: { cookie: `${AUTH_COOKIE_NAME}=garbage`, authorization: `Bearer ${token}` },
    } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAuth', () => {
  it('rejects a request with no Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a header that is not a Bearer token', () => {
    const req = { headers: { authorization: 'Basic abc' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects an invalid token', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired token', () => {
    const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTU';
    const { token } = createSessionToken(address, -10);
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sets req.auth and calls next for a valid token', () => {
    const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTU';
    const { token } = createSessionToken(address);
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(req.auth).toEqual({ address });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  const communityId = '3f2b8c1e-9d4a-4e7b-8a61-2c5d7e9f0a12';
  const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTU';

  it('rejects when req.auth is missing', async () => {
    const req = { params: { id: communityId } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the caller has no membership row', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const req = { params: { id: communityId }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the caller has a role outside the allowed set', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'member' }]);
    const req = { params: { id: communityId }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin', 'treasurer'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('calls next when the caller holds an allowed role', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'treasurer' }]);
    const req = { params: { id: communityId }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin', 'treasurer'])(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('fails closed when the allowed role list is empty', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const req = { params: { id: communityId }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole([])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards database errors to next without leaking them in the response', async () => {
    const failure = new Error('connection refused');
    mockDb.query.mockRejectedValueOnce(failure);
    const req = { params: { id: communityId }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('keeps requireCommunityRole as an alias of requireRole', () => {
    expect(requireCommunityRole).toBe(requireRole);
  });

  it('extracts community ID from params.communityId when params.id is not set', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const req = {
      params: { communityId },
      auth: { address },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.any(String),
      [communityId, address]
    );
    expect(next).toHaveBeenCalled();
  });

  it('extracts community ID from body.communityId when params are not set', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    const req = {
      params: {},
      body: { communityId },
      auth: { address },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.any(String),
      [communityId, address]
    );
    expect(next).toHaveBeenCalled();
  });

  it('looks up community by issuerPublicKey when provided in body', async () => {
    const issuerKey = 'GISSUERKEY' + 'A'.repeat(45);
    mockDb.query
      .mockResolvedValueOnce([{ id: communityId }]) // Community lookup
      .mockResolvedValueOnce([{ role: 'admin' }]); // Role check
    const req = {
      params: {},
      body: { issuerPublicKey: issuerKey },
      auth: { address },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(mockDb.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('issuer_public_key'),
      [issuerKey]
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      [communityId, address]
    );
    expect(next).toHaveBeenCalled();
  });

  it('returns 404 when community cannot be found by issuerPublicKey', async () => {
    const issuerKey = 'GISSUERKEY' + 'A'.repeat(45);
    mockDb.query.mockResolvedValueOnce([]); // No community found
    const req = {
      params: {},
      body: { issuerPublicKey: issuerKey },
      auth: { address },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ data: null, error: 'Community not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when no community ID can be determined', async () => {
    const req = {
      params: {},
      body: {},
      auth: { address },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ data: null, error: 'Community not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts member with exact role match', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'observer' }]);
    const req = { params: { id: communityId }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['observer'])(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('includes required roles in error message', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'observer' }]);
    const req = { params: { id: communityId }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin', 'treasurer'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      data: null,
      error: 'Requires community role: admin or treasurer',
    });
  });

  it('filters out soft-deleted members', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const req = { params: { id: communityId }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireRole(['admin'])(req, res, next);

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at IS NULL'),
      [communityId, address]
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
