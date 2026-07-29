import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { getAssetSupply } from '../../../contracts/assets';

jest.mock('../../../contracts/assets', () => ({
  getAssetSupply: jest.fn(),
  getAssetHolders: jest.fn(),
  issueAsset: jest.fn(),
  burnAsset: jest.fn(),
}));

const mockGetAssetSupply = getAssetSupply as jest.Mock;
const issuer = Keypair.random().publicKey();

describe('GET /api/v1/tokens/supply/:assetCode/:issuer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns the supply reported by Horizon', async () => {
    mockGetAssetSupply.mockResolvedValueOnce('1250.5000000');

    const response = await request(app).get(`/api/v1/tokens/supply/ECO/${issuer}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        assetCode: 'ECO',
        issuer,
        supply: '1250.5000000',
      },
    });
    expect(mockGetAssetSupply).toHaveBeenCalledWith('ECO', issuer);
  });

  it('rejects malformed path parameters with the API error envelope', async () => {
    const response = await request(app).get('/api/v1/tokens/supply/not-valid!/not-an-issuer');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request parameters');
    expect(response.body.meta.errors).toBeDefined();
    expect(mockGetAssetSupply).not.toHaveBeenCalled();
  });

  it('maps an unavailable Horizon response to an actionable error', async () => {
    mockGetAssetSupply.mockRejectedValueOnce({ response: { status: 503 } });

    const response = await request(app).get(`/api/v1/tokens/supply/ECO/${issuer}`);

    expect(response.status).toBe(502);
    expect(response.body.error).toMatch(/Horizon is temporarily unavailable/);
  });
});
