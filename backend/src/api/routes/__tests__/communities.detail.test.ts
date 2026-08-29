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
  it('returns the nested community detail and statistics response', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        {
          id: communityId,
          name: 'ClimateDAO',
          description: 'Community treasury',
          issuer_public_key: issuer,
          asset_code: 'CLIMATE',
          asset_issuer: issuer,
          avatar_url: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted_at: null,
          settings: { votingPeriodDays: 7 },
          member_count: 4,
        },
      ])
      .mockResolvedValueOnce([
        {
          asset_code: 'CLIMATE',
          asset_issuer: issuer,
          total_supply: '1000.0000000',
          description: 'Community token',
          icon_url: 'https://example.com/climate.png',
        },
      ])
      .mockResolvedValueOnce([{ total_transactions: 7, total_token_supply: '1000.0000000' }]);

    const response = await request(app).get(`/api/v1/communities/${communityId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        community: expect.objectContaining({
          id: communityId,
          name: 'ClimateDAO',
          member_count: 4,
          settings: { votingPeriodDays: 7 },
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
        statistics: {
          totalTransactions: 7,
          totalTokenSupply: 1000,
        },
      },
    });
  });

  it('sums total_token_supply across multiple tokens issued for the community', async () => {
    mockDb.query
      .mockResolvedValueOnce([
        {
          id: communityId,
          name: 'Community DAO',
          description: 'A test community',
          issuer_public_key: issuer,
          asset_code: 'CDAO',
          asset_issuer: issuer,
          avatar_url: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted_at: null,
          settings: { loanLimit: 500 },
          member_count: 4,
        },
      ])
      .mockResolvedValueOnce([
        {
          asset_code: 'CDAO',
          asset_issuer: issuer,
          total_supply: '1000.0000000',
          description: 'Community token',
          icon_url: 'https://example.com/cdao.png',
        },
        {
          asset_code: 'REWARD',
          asset_issuer: issuer,
          total_supply: '250.5000000',
          description: null,
          icon_url: null,
        },
      ])
      .mockResolvedValueOnce([{ total_transactions: 12, total_token_supply: '1250.5000000' }]);

    const response = await request(app).get(`/api/v1/communities/${communityId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        community: expect.objectContaining({
          id: communityId,
          member_count: 4,
          settings: { loanLimit: 500 },
          tokens: [
            {
              asset_code: 'CDAO',
              asset_issuer: issuer,
              total_supply: '1000.0000000',
              description: 'Community token',
              icon_url: 'https://example.com/cdao.png',
            },
            {
              asset_code: 'REWARD',
              asset_issuer: issuer,
              total_supply: '250.5000000',
              description: null,
              icon_url: null,
            },
          ],
        }),
        statistics: {
          totalTransactions: 12,
          totalTokenSupply: 1250.5,
        },
      },
    });
  });
});
