import request from 'supertest';
import app from '../app';

jest.mock('../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue(true),
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn(),
  },
}));

jest.mock('../contracts/stellar', () => ({
  StellarService: {
    ping: jest.fn().mockResolvedValue(true),
    getAccountBalance: jest.fn(),
  },
}));

describe('API version prefix', () => {
  it('serves resource routes under /api/v1', async () => {
    const res = await request(app).get('/api/v1/communities');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('does not serve resource routes without the /api/v1 prefix', async () => {
    const res = await request(app).get('/api/communities');
    expect(res.status).toBe(404);
  });

  it('keeps health checks unversioned', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
