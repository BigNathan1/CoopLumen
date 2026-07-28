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
const mockGetAccountBalance = StellarService.getAccountBalance as jest.Mock;
const publicKey = Keypair.random().publicKey();
const communityId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/balances/:publicKey', () => {
  it('returns account balances', async () => {
    mockGetAccountBalance.mockResolvedValueOnce([{ asset_code: 'XLM', balance: '100' }]);
    const res = await request(app).get(`/api/v1/balances/${publicKey}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ asset_code: 'XLM', balance: '100' }]);
  });
});

describe('GET /api/v1/balances/:publicKey/loans', () => {
  it('returns paginated loans for the address', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: 'loan-1', borrower_address: publicKey }]);
    const res = await request(app).get(`/api/v1/balances/${publicKey}/loans?page=1&limit=10`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 10, pages: 1 });
  });
});

describe('GET /api/v1/balances/community/:communityId/loans', () => {
  it('returns paginated loans for the community', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ id: 'loan-1' }, { id: 'loan-2' }]);
    const res = await request(app).get(`/api/v1/balances/community/${communityId}/loans`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20, pages: 1 });
  });
});
