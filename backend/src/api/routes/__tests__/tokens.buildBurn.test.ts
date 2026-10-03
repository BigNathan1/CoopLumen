import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { buildUnsignedPayment, submitSignedXdr } from '../../../contracts/transactions';
import { getTotalSupply } from '../../../contracts/assets';

jest.mock('../../../db', () => ({
  db: { query: jest.fn(), ping: jest.fn() },
}));

jest.mock('../../../contracts/transactions', () => ({
  buildUnsignedPayment: jest.fn(),
  submitSignedXdr: jest.fn(),
}));

jest.mock('../../../contracts/assets', () => ({
  getTotalSupply: jest.fn(),
  getAssetHolders: jest.fn(),
  buildUnsignedIssueAsset: jest.fn(),
}));

const HOLDER = Keypair.random().publicKey();
const ISSUER = Keypair.random().publicKey();

describe('POST /api/v1/tokens/build-burn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a payment back to the issuing account', async () => {
    (buildUnsignedPayment as jest.Mock).mockResolvedValueOnce('unsigned-burn-xdr');

    const res = await request(app).post('/api/v1/tokens/build-burn').send({
      holderPublicKey: HOLDER,
      assetCode: 'ECO',
      assetIssuer: ISSUER,
      amount: '25',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.xdr).toBe('unsigned-burn-xdr');
    expect(buildUnsignedPayment).toHaveBeenCalledWith({
      senderPublicKey: HOLDER,
      destinationPublicKey: ISSUER,
      assetCode: 'ECO',
      assetIssuer: ISSUER,
      amount: '25',
    });
  });

  it('never asks for a secret key', async () => {
    const res = await request(app).post('/api/v1/tokens/build-burn').send({
      holderSecret: Keypair.random().secret(),
      assetCode: 'ECO',
      assetIssuer: ISSUER,
      amount: '25',
    });

    expect(res.status).toBe(400);
    expect(buildUnsignedPayment).not.toHaveBeenCalled();
  });

  it('rejects a malformed holder public key', async () => {
    const res = await request(app)
      .post('/api/v1/tokens/build-burn')
      .send({ holderPublicKey: 'not-a-key', assetCode: 'ECO', assetIssuer: ISSUER, amount: '25' });

    expect(res.status).toBe(400);
    expect(res.body.meta.errors).toBeDefined();
  });

  it('rejects a non-positive amount', async () => {
    const res = await request(app)
      .post('/api/v1/tokens/build-burn')
      .send({ holderPublicKey: HOLDER, assetCode: 'ECO', assetIssuer: ISSUER, amount: '0' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/tokens/submit with refreshSupply', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('re-reads circulating supply from Horizon after the burn lands', async () => {
    (submitSignedXdr as jest.Mock).mockResolvedValueOnce('tx-hash-burn');
    (getTotalSupply as jest.Mock).mockResolvedValueOnce('975.0000000');
    (db.query as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/v1/tokens/submit')
      .send({
        signedXdr: 'signed-burn-xdr',
        refreshSupply: { assetCode: 'ECO', assetIssuer: ISSUER },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe('tx-hash-burn');
    expect(getTotalSupply).toHaveBeenCalledWith('ECO', ISSUER);
    // The stored figure comes from Horizon, never from the request body.
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual(['975.0000000', 'ECO', ISSUER]);
  });

  it('leaves the recorded supply alone when refreshSupply is omitted', async () => {
    (submitSignedXdr as jest.Mock).mockResolvedValueOnce('tx-hash-plain');

    const res = await request(app).post('/api/v1/tokens/submit').send({ signedXdr: 'signed-xdr' });

    expect(res.status).toBe(200);
    expect(getTotalSupply).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });
});
