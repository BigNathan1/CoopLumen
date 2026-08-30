import request from 'supertest';
import app from '../../../app';
import { StellarService } from '../../../contracts/stellar';
import { db } from '../../../db';

jest.mock('../../../db', () => (
  {
    db: {
      query: jest.fn(),
    },
  }
));

jest.mock('../../../contracts/stellar', () => (
  {
    StellarService: {
      getTransactionHistory: jest.fn(),
    },
  }
));
jest.mock('../../../db', () => ({
  db: {
    query: jest.fn(),
  },
}));

jest.mock('../../../contracts/stellar', () => ({
  StellarService: {
    getTransactionHistory: jest.fn(),
  },
}));

describe('GET /api/v1/transactions/export/:communityId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 for an invalid community ID UUID', async () => {
    const res = await request(app).get('/api/v1/transactions/export/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 404 when community does not exist', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/v1/transactions/export/12345678-1234-5678-1234-567812345678');
    (db.query as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get(
      '/api/v1/transactions/export/11111111-1111-4111-8111-111111111111'
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Community not found');
  });

  it('returns CSV of transaction history successfully', async () => {
    (db.query as jest.Mock).mockResolvedValue({
      rows: [{ issuer_public_key: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' }],
    });
    (db.query as jest.Mock).mockResolvedValue([
      { issuer_public_key: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
    ]);

    (StellarService.getTransactionHistory as jest.Mock).mockResolvedValue([
      {
        id: 'tx_hash_1',
        created_at: '2023-01-01T00:00:00Z',
        source_account: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        fee_charged: '100',
        successful: true,
        memo_type: 'text',
        memo: 'test memo',
      },
    ]);

    const res = await request(app).get('/api/v1/transactions/export/12345678-1234-5678-1234-567812345678');
    const res = await request(app).get(
      '/api/v1/transactions/export/11111111-1111-4111-8111-111111111111'
    );
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('text/csv');
    expect(res.header['content-disposition']).toContain('attachment;');
    expect(res.text).toContain('id,created_at,source_account,fee_charged,successful,memo');
    expect(res.text).toContain('tx_hash_1');
    expect(res.text).toContain('test memo');
  });
});
