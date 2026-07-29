import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { issueAsset } from '../../../contracts/assets';
import { establishTrustline } from '../../../contracts/trustlines';

jest.mock('../../../contracts/assets', () => ({
  issueAsset: jest.fn(),
}));
jest.mock('../../../contracts/trustlines', () => ({
  establishTrustline: jest.fn(),
}));

const mockIssueAsset = issueAsset as jest.Mock;
const mockEstablishTrustline = establishTrustline as jest.Mock;
const distributor = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();

beforeEach(() => {
  jest.resetAllMocks();
});

describe('POST /api/v1/tokens/issue', () => {
  it('returns 400 on invalid payload', async () => {
    const res = await request(app).post('/api/v1/tokens/issue').send({});
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toBeDefined();
  });

  it('returns 400 when amount is not a valid decimal string', async () => {
    const res = await request(app)
      .post('/api/v1/tokens/issue')
      .send({
        issuerSecret: 'S'.repeat(56),
        assetCode: 'ECO',
        distributorPublicKey: distributor,
        amount: 'not-a-number',
      });
    expect(res.status).toBe(400);
  });

  it('issues a token with a valid payload', async () => {
    mockIssueAsset.mockResolvedValueOnce('tx-hash-1');
    const res = await request(app)
      .post('/api/v1/tokens/issue')
      .send({
        issuerSecret: 'S'.repeat(56),
        assetCode: 'ECO',
        distributorPublicKey: distributor,
        amount: '100.0000000',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.txHash).toBe('tx-hash-1');
    expect(mockIssueAsset).toHaveBeenCalledWith(
      expect.objectContaining({ assetCode: 'ECO', amount: '100.0000000' })
    );
  });
});

describe('POST /api/v1/tokens/trustline', () => {
  it('returns 400 on invalid payload', async () => {
    const res = await request(app).post('/api/v1/tokens/trustline').send({});
    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toBeDefined();
  });

  it('establishes a trustline with a valid payload', async () => {
    mockEstablishTrustline.mockResolvedValueOnce('tx-hash-2');
    const res = await request(app)
      .post('/api/v1/tokens/trustline')
      .send({
        accountSecret: 'S'.repeat(56),
        assetCode: 'ECO',
        assetIssuer: issuer,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.txHash).toBe('tx-hash-2');
  });
});
