import { Request, Response } from 'express';
import { requireAuth, requireRole, requireCommunityRole } from '../auth';
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
});
