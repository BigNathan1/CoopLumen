import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { buildBatchPayment } from '../../../contracts/batchPayments';

jest.mock('../../../db', () => ({
  db: { query: jest.fn(), ping: jest.fn() },
}));

jest.mock('../../../contracts/batchPayments', () => ({
  buildBatchPayment: jest.fn(),
}));

const ISSUER = Keypair.random().publicKey();
const MEMBERS = [Keypair.random().publicKey(), Keypair.random().publicKey()];
const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';

const mockQuery = db.query as jest.Mock;

function community(assetIssuer = ISSUER) {
  return [{ asset_code: 'ECO', asset_issuer: assetIssuer }];
}

describe('POST /api/v1/tokens/build-airdrop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds one transaction paying every member', async () => {
    mockQuery
      .mockResolvedValueOnce(community())
      .mockResolvedValueOnce(MEMBERS.map((stellar_address) => ({ stellar_address })));
    (buildBatchPayment as jest.Mock).mockResolvedValueOnce('unsigned-airdrop-xdr');

    const res = await request(app).post('/api/v1/tokens/build-airdrop').send({
      communityId: COMMUNITY_ID,
      issuerPublicKey: ISSUER,
      amount: '10',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      xdr: 'unsigned-airdrop-xdr',
      recipientCount: 2,
      amount: '10',
    });
    expect(buildBatchPayment).toHaveBeenCalledWith({
      senderPublicKey: ISSUER,
      payments: MEMBERS.map((destinationPublicKey) => ({
        destinationPublicKey,
        assetCode: 'ECO',
        assetIssuer: ISSUER,
        amount: '10',
      })),
      memo: undefined,
    });
  });

  it('passes a memo through to the batch', async () => {
    mockQuery
      .mockResolvedValueOnce(community())
      .mockResolvedValueOnce([{ stellar_address: MEMBERS[0] }]);
    (buildBatchPayment as jest.Mock).mockResolvedValueOnce('unsigned-airdrop-xdr');

    await request(app).post('/api/v1/tokens/build-airdrop').send({
      communityId: COMMUNITY_ID,
      issuerPublicKey: ISSUER,
      amount: '10',
      memo: 'Q1 dividend',
    });

    expect((buildBatchPayment as jest.Mock).mock.calls[0][0].memo).toBe('Q1 dividend');
  });

  it('returns 404 for a community that does not exist', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await request(app).post('/api/v1/tokens/build-airdrop').send({
      communityId: COMMUNITY_ID,
      issuerPublicKey: ISSUER,
      amount: '10',
    });

    expect(res.status).toBe(404);
    expect(buildBatchPayment).not.toHaveBeenCalled();
  });

  it('rejects an issuer that does not own the community token', async () => {
    mockQuery.mockResolvedValueOnce(community(Keypair.random().publicKey()));

    const res = await request(app).post('/api/v1/tokens/build-airdrop').send({
      communityId: COMMUNITY_ID,
      issuerPublicKey: ISSUER,
      amount: '10',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong to the community token issuer/);
    expect(buildBatchPayment).not.toHaveBeenCalled();
  });

  it('rejects a community with no members', async () => {
    mockQuery.mockResolvedValueOnce(community()).mockResolvedValueOnce([]);

    const res = await request(app).post('/api/v1/tokens/build-airdrop').send({
      communityId: COMMUNITY_ID,
      issuerPublicKey: ISSUER,
      amount: '10',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no members/);
    expect(buildBatchPayment).not.toHaveBeenCalled();
  });

  it('never asks for a secret key', async () => {
    const res = await request(app).post('/api/v1/tokens/build-airdrop').send({
      communityId: COMMUNITY_ID,
      issuerSecret: Keypair.random().secret(),
      amount: '10',
    });

    expect(res.status).toBe(400);
    expect(buildBatchPayment).not.toHaveBeenCalled();
  });
});
