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
const communityId = '11111111-1111-4111-8111-111111111111';
const validKey = Keypair.random().publicKey();

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/communities/:id enrichment', () => {
  it('returns the member count and complete token list', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        {
          id: communityId,
          name: 'Community DAO',
          description: 'A test community',
          issuer_public_key: validKey,
          asset_code: 'CDAO',
          asset_issuer: validKey,
        },
      ])
      .mockResolvedValueOnce([{ count: 4 }])
      .mockResolvedValueOnce([
        {
          asset_code: 'CDAO',
          asset_issuer: validKey,
          total_supply: '1000.0000000',
          description: 'Community token',
          icon_url: 'https://example.com/cdao.png',
        },
        {
          asset_code: 'REWARD',
          asset_issuer: validKey,
          total_supply: '250.5000000',
          description: null,
          icon_url: null,
        },
      ])
      .mockResolvedValueOnce([{ count: 12 }]);

    const response = await request(app).get(`/api/v1/communities/${communityId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: expect.objectContaining({
        id: communityId,
        member_count: 4,
        tokens: [
          {
            asset_code: 'CDAO',
            asset_issuer: validKey,
            total_supply: '1000.0000000',
            description: 'Community token',
            icon_url: 'https://example.com/cdao.png',
          },
          {
            asset_code: 'REWARD',
            asset_issuer: validKey,
            total_supply: '250.5000000',
            description: null,
            icon_url: null,
          },
        ],
      }),
    });
  });
});
