import express from 'express';
import request from 'supertest';

const mockQuery = jest.fn();

jest.mock('../../../db', () => {
  const query = (...args: unknown[]) => mockQuery(...args);
  return { __esModule: true, default: { query }, db: { query }, query };
});

jest.mock('../../middleware/auth', () => ({
  __esModule: true,
  requireAuth: (req: { auth?: unknown }, _res: unknown, next: () => void) => {
    req.auth = { address: 'GOWNER', userId: 'user-1' };
    next();
  },
}));

import { apiKeysRouter } from '../apiKeys';
import { authenticateApiKey, generateApiKey, hashApiKey } from '../../utils/apiKey';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/api-keys', apiKeysRouter);
  return app;
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('generateApiKey', () => {
  it('prefixes the key and hashes the full value', () => {
    const generated = generateApiKey();

    expect(generated.key.startsWith('cl_live_')).toBe(true);
    expect(generated.prefix).toBe(generated.key.slice(0, 16));
    expect(generated.hash).toBe(hashApiKey(generated.key));
    expect(generated.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('authenticateApiKey', () => {
  it('rejects values without the key prefix', async () => {
    await expect(authenticateApiKey('bearer-token')).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects over-long values', async () => {
    await expect(authenticateApiKey(`cl_live_${'x'.repeat(100)}`)).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns null for an unknown key', async () => {
    mockQuery.mockResolvedValue([]);

    await expect(authenticateApiKey('cl_live_unknown')).resolves.toBeNull();
  });

  it('returns the owner and records usage', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'key-1', owner_address: 'GOWNER' }])
      .mockResolvedValueOnce([]);

    await expect(authenticateApiKey('cl_live_known')).resolves.toBe('GOWNER');
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining('last_used_at'), ['key-1']);
  });
});

describe('POST /api/v1/api-keys', () => {
  it('rejects a key without a name', async () => {
    const res = await request(buildApp()).post('/api/v1/api-keys').send({});

    expect(res.status).toBe(400);
  });

  it('returns the key exactly once', async () => {
    mockQuery.mockResolvedValue([{ id: 'key-1', created_at: '2026-01-01T00:00:00.000Z' }]);

    const res = await request(buildApp())
      .post('/api/v1/api-keys')
      .send({ name: 'CI', expiresAt: '2099-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: 'key-1', name: 'CI' });
    expect(res.body.data.key.startsWith('cl_live_')).toBe(true);
    expect(res.body.meta.warning).toMatch(/only once/i);
  });

  it('returns a server error when the insert fails', async () => {
    mockQuery.mockRejectedValue(new Error('boom'));

    const res = await request(buildApp()).post('/api/v1/api-keys').send({ name: 'CI' });

    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/v1/api-keys/:id', () => {
  it('returns 404 when no key was revoked', async () => {
    mockQuery.mockResolvedValue([]);

    const res = await request(buildApp()).delete('/api/v1/api-keys/key-1');

    expect(res.status).toBe(404);
  });

  it('revokes the key', async () => {
    mockQuery.mockResolvedValue([{ id: 'key-1' }]);

    const res = await request(buildApp()).delete('/api/v1/api-keys/key-1');

    expect(res.status).toBe(204);
  });
});
