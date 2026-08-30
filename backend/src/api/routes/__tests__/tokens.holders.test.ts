import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { getAssetHolders } from '../../../contracts/assets';

jest.mock('../../../contracts/assets', () => ({
  getAssetHolders: jest.fn(),
  issueAsset: jest.fn(),
  burnAsset: jest.fn(),
  getAssetSupply: jest.fn(),
}));

const mockGetAssetHolders = getAssetHolders as jest.Mock;
const issuerKeypair = Keypair.random();

describe('GET /api/v1/tokens/holders/:assetCode/:issuer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns asset holders successfully', async () => {
    const holders = [
      {
        account_id: Keypair.random().publicKey(),
        balance: '100.0000000',
      },
      {
        account_id: Keypair.random().publicKey(),
        balance: '250.5000000',
      },
    ];

    mockGetAssetHolders.mockResolvedValueOnce(holders);

    const response = await request(app).get(
      `/api/v1/tokens/holders/ECO/${issuerKeypair.publicKey()}`
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: holders });
    expect(mockGetAssetHolders).toHaveBeenCalledWith('ECO', issuerKeypair.publicKey());
  });

  it('validates asset code format', async () => {
    const response = await request(app).get(
      `/api/v1/tokens/holders/invalid-code!/${issuerKeypair.publicKey()}`
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid asset code');
    expect(mockGetAssetHolders).not.toHaveBeenCalled();
  });

  it('validates issuer public key format', async () => {
    const response = await request(app).get('/api/v1/tokens/holders/ECO/invalid-issuer');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid Stellar issuer address');
    expect(mockGetAssetHolders).not.toHaveBeenCalled();
  });

  it('handles Horizon service errors', async () => {
    const horizonError = {
      response: {
        status: 404,
        data: { detail: 'Asset not found' },
      },
    };
    mockGetAssetHolders.mockRejectedValueOnce(horizonError);

    const response = await request(app).get(
      `/api/v1/tokens/holders/ECO/${issuerKeypair.publicKey()}`
    );

    expect(response.status).toBe(404);
    expect(response.body.data).toBeNull();
    expect(response.body.error).toBeDefined();
  });

  it('handles non-Horizon errors', async () => {
    const genericError = new Error('Network error');
    mockGetAssetHolders.mockRejectedValueOnce(genericError);

    const response = await request(app).get(
      `/api/v1/tokens/holders/ECO/${issuerKeypair.publicKey()}`
    );

    expect(response.status).toBe(500);
  });

  it('returns empty array when no holders exist', async () => {
    mockGetAssetHolders.mockResolvedValueOnce([]);

    const response = await request(app).get(
      `/api/v1/tokens/holders/ECO/${issuerKeypair.publicKey()}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});
