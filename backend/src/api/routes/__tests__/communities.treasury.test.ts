import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { StellarService } from '../../../contracts/stellar';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock('../../../contracts/stellar', () => ({
  StellarService: {
    getAccountBalance: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockStellar = StellarService as jest.Mocked<typeof StellarService>;
const validKey = Keypair.random().publicKey();
const validUUID = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/communities/:id/treasury', () => {
  it('returns 400 when :id is not a valid UUID', async () => {
    const res = await request(app).get('/api/v1/communities/not-a-uuid/treasury');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.meta.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'id', message: expect.any(String) })])
    );
  });

  it('returns 404 when community does not exist', async () => {
    mockDb.query.mockResolvedValueOnce([]);
    const res = await request(app).get(`/api/v1/communities/${validUUID}/treasury`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Community not found');
  });

  it('returns 200 with account and balances for a valid community', async () => {
    const balances = [
      { asset_type: 'native', balance: '100.0000000' },
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'COOP',
        asset_issuer: validKey,
        balance: '5000.00',
      },
    ];

    mockDb.query.mockResolvedValueOnce([{ issuer_public_key: validKey }]);
    mockStellar.getAccountBalance.mockResolvedValueOnce(balances as any);

    const res = await request(app).get(`/api/v1/communities/${validUUID}/treasury`);
    expect(res.status).toBe(200);
    expect(res.body.data.account).toBe(validKey);
    expect(res.body.data.balances).toEqual(balances);
    expect(mockStellar.getAccountBalance).toHaveBeenCalledWith(validKey);
  });

  it('returns 500 when StellarService throws', async () => {
    mockDb.query.mockResolvedValueOnce([{ issuer_public_key: validKey }]);
    mockStellar.getAccountBalance.mockRejectedValueOnce(new Error('Horizon unavailable'));

    const res = await request(app).get(`/api/v1/communities/${validUUID}/treasury`);
    expect(res.status).toBe(500);
  });
});
