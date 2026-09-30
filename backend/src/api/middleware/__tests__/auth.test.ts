import { Request, Response } from 'express';
import { requireAuth, requireCommunityRole, authenticateJWT } from '../auth';
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

describe('requireCommunityRole', () => {
  const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTU';

  it('rejects when req.auth is missing', async () => {
    const req = { params: { id: 'community-1' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireCommunityRole(['admin'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the caller has no membership row', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const req = { params: { id: 'community-1' }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireCommunityRole(['admin'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the caller has a role outside the allowed set', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'member' }]);
    const req = { params: { id: 'community-1' }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireCommunityRole(['admin', 'treasurer'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('calls next when the caller holds an allowed role', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'treasurer' }]);
    const req = { params: { id: 'community-1' }, auth: { address } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await requireCommunityRole(['admin', 'treasurer'])(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
