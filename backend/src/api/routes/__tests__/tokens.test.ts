import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';

jest.mock('../../../db', () => ({
  db: {
    query: jest.fn(),
    ping: jest.fn(),
  },
}));

const mockQuery = db.query as jest.Mock;
const issuer = Keypair.random().publicKey();

describe('GET /api/v1/tokens/:assetCode/:issuer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects an invalid asset code', async () => {
    const response = await request(app).get(`/api/v1/tokens/not-valid!/${issuer}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.meta.errors).toBeDefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an invalid issuer', async () => {
    const response = await request(app).get('/api/v1/tokens/ECO/not-a-stellar-key');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns token metadata for a valid asset pair', async () => {
    const token = {
      id: 'community-1',
      asset_code: 'ECO',
      asset_issuer: issuer,
      name: 'Eco Token',
      description: 'Community ecological token',
    };
    mockQuery.mockResolvedValueOnce([token]);

    const response = await request(app).get(`/api/v1/tokens/ECO/${issuer}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: token });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM communities'), [
      'ECO',
      issuer,
    ]);
  });

  it('returns a structured 404 when the token does not exist', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const response = await request(app).get(`/api/v1/tokens/ECO/${issuer}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ data: null, error: 'Token not found' });
  });

  it('handles database errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

    const response = await request(app).get(`/api/v1/tokens/ECO/${issuer}`);

    expect(response.status).toBe(500);
  });

  it('validates asset code length', async () => {
    const longAssetCode = 'VERYLONGASSETCODE'; // exceeds 12 chars
    const response = await request(app).get(`/api/v1/tokens/${longAssetCode}/${issuer}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('validates asset code characters', async () => {
    const response = await request(app).get(`/api/v1/tokens/ECO-COIN/${issuer}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
