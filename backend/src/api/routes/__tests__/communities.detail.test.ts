import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const issuer = Keypair.random().publicKey();
const communityId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/communities/:id enriched response', () => {
  it('returns member count and the community token list in the data envelope', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        {
          id: communityId,
          name: 'ClimateDAO',
          description: 'Community treasury',
          issuer_public_key: issuer,
          asset_code: 'CLIMATE',
          asset_issuer: issuer,
        },
      ])
      .mockResolvedValueOnce([{ count: 4 }])
      .mockResolvedValueOnce([
        {
          asset_code: 'CLIMATE',
          asset_issuer: issuer,
          total_supply: '1000.0000000',
          description: 'Community token',
          icon_url: 'https://example.com/climate.png',
        },
      ])
      .mockResolvedValueOnce([{ count: 7 }]);

    const response = await request(app).get(`/api/v1/communities/${communityId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: expect.objectContaining({
        id: communityId,
        name: 'ClimateDAO',
        member_count: 4,
        tokens: [
          {
            asset_code: 'CLIMATE',
            asset_issuer: issuer,
            total_supply: '1000.0000000',
            description: 'Community token',
            icon_url: 'https://example.com/climate.png',
          },
        ],
      }),
    });
  });
});
