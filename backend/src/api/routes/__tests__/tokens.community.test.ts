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

describe('GET /api/v1/tokens/:communityId', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const communityId = 'comm-123-456';
  const tokens = [
    {
      id: 'token-1',
      community_id: communityId,
      asset_code: 'ECO',
      asset_issuer: Keypair.random().publicKey(),
      distributor_address: Keypair.random().publicKey(),
      total_supply: '1000.0000000',
      name: 'Eco Token',
      description: 'Community ecological token',
      icon_url: 'https://example.com/icon.png',
      decimals: 7,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'token-2',
      community_id: communityId,
      asset_code: 'SOCIAL',
      asset_issuer: Keypair.random().publicKey(),
      distributor_address: Keypair.random().publicKey(),
      total_supply: '500.0000000',
      name: 'Social Token',
      description: 'Community social impact token',
      icon_url: null,
      decimals: 6,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    },
  ];

  it('returns tokens for a community', async () => {
    mockQuery.mockResolvedValueOnce(tokens);

    const response = await request(app).get(`/api/v1/tokens/${communityId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: tokens });
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM tokens WHERE community_id = $1 ORDER BY created_at',
      [communityId]
    );
  });

  it('returns empty array when community has no tokens', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const response = await request(app).get(`/api/v1/tokens/${communityId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  it('handles database errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

    const response = await request(app).get(`/api/v1/tokens/${communityId}`);

    expect(response.status).toBe(500);
  });

  it('works with different community ID formats', async () => {
    const uuidCommunityId = '550e8400-e29b-41d4-a716-446655440000';
    mockQuery.mockResolvedValueOnce([]);

    const response = await request(app).get(`/api/v1/tokens/${uuidCommunityId}`);

    expect(response.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM tokens WHERE community_id = $1 ORDER BY created_at',
      [uuidCommunityId]
    );
  });
});