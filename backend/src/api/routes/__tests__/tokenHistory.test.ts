import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { StellarService } from '../../../contracts/stellar';

jest.mock('../../../contracts/stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    ping: jest.fn().mockResolvedValue(true),
  },
}));

const mockGetServer = StellarService.getServer as jest.Mock;
const issuer = Keypair.random().publicKey();

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/tokens/history/:assetCode/:issuer', () => {
  it('returns the asset operation history from Horizon', async () => {
    const records = [
      {
        id: 'operation-1',
        type: 'payment',
        transaction_hash: 'transaction-1',
      },
    ];
    const call = jest.fn().mockResolvedValue({ records });
    const order = jest.fn().mockReturnValue({ call });
    const limit = jest.fn().mockReturnValue({ order });
    const forAsset = jest.fn().mockReturnValue({ limit });
    mockGetServer.mockReturnValue({
      operations: jest.fn().mockReturnValue({ forAsset }),
    });

    const response = await request(app).get(`/api/v1/tokens/history/ECO/${issuer}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(records);
    expect(response.body.meta).toEqual({ assetCode: 'ECO', issuer, limit: 20 });
    expect(forAsset).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(20);
    expect(order).toHaveBeenCalledWith('desc');
  });

  it('returns the standard error envelope for invalid parameters', async () => {
    const response = await request(app).get('/api/v1/tokens/history/invalid-code/not-an-issuer');

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.meta.errors).toBeInstanceOf(Array);
    expect(mockGetServer).not.toHaveBeenCalled();
  });
});
