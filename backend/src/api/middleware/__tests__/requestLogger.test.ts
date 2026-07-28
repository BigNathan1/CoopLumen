import request from 'supertest';
import app from '../../../app';
import { logger } from '../../../utils/logger';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue(true),
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn(),
  },
}));

jest.mock('../../../contracts/stellar', () => ({
  StellarService: {
    ping: jest.fn().mockResolvedValue(true),
    getAccountBalance: jest.fn(),
  },
}));

describe('requestLogger', () => {
  it('logs method, path, status, and duration for a successful request', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      'Request handled',
      expect.objectContaining({
        method: 'GET',
        path: '/health',
        status: 200,
        durationMs: expect.any(Number),
      })
    );

    infoSpy.mockRestore();
  });

  it('logs the actual response status for a 404', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(infoSpy).toHaveBeenCalledWith(
      'Request handled',
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/does-not-exist',
        status: 404,
        durationMs: expect.any(Number),
      })
    );

    infoSpy.mockRestore();
  });
});
