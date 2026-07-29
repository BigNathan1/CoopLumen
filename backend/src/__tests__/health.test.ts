import request from 'supertest';
import app from '../app';
import { db } from '../db';
import { StellarService } from '../contracts/stellar';

jest.mock('../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn(),
  },
}));

jest.mock('../contracts/stellar', () => ({
  StellarService: {
    ping: jest.fn(),
    getAccountBalance: jest.fn(),
  },
}));

const mockedDbPing = db.ping as jest.Mock;
const mockedStellarPing = StellarService.ping as jest.Mock;

describe('GET /api/health', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with status/db/stellar/uptime when both dependencies are healthy', async () => {
    mockedDbPing.mockResolvedValue(true);
    mockedStellarPing.mockResolvedValue(true);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', stellar: 'ok' });
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 with db: error when the database is unreachable', async () => {
    mockedDbPing.mockResolvedValue(false);
    mockedStellarPing.mockResolvedValue(true);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('error');
    expect(res.body.stellar).toBe('ok');
  });

  it('reports stellar: error without failing the whole check when only Horizon is unreachable', async () => {
    mockedDbPing.mockResolvedValue(true);
    mockedStellarPing.mockResolvedValue(false);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
    expect(res.body.stellar).toBe('error');
  });

  it('treats a rejected ping as unreachable rather than propagating the error', async () => {
    mockedDbPing.mockRejectedValue(new Error('connection refused'));
    mockedStellarPing.mockResolvedValue(true);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.db).toBe('error');
  });

  it('serves the same payload shape at the unversioned /health alias', async () => {
    mockedDbPing.mockResolvedValue(true);
    mockedStellarPing.mockResolvedValue(true);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', stellar: 'ok' });
    expect(typeof res.body.uptime).toBe('number');
  });
});
