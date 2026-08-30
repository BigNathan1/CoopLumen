import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { burnAsset } from '../../../contracts/assets';

jest.mock('../../../db', () => ({
  db: {
    query: jest.fn(),
    ping: jest.fn(),
  },
}));

jest.mock('../../../contracts/assets', () => ({
  burnAsset: jest.fn(),
  issueAsset: jest.fn(),
  getAssetHolders: jest.fn(),
  getAssetSupply: jest.fn(),
}));

const mockQuery = db.query as jest.Mock;
const mockBurnAsset = burnAsset as jest.Mock;

const holderKeypair = Keypair.random();
const issuerKeypair = Keypair.random();

describe('POST /api/v1/tokens/burn', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const validBurnRequest = {
    holderSecret: holderKeypair.secret(),
    assetCode: 'ECO',
    assetIssuer: issuerKeypair.publicKey(),
    amount: '100.0000000',
  };

  it('burns tokens successfully and updates total supply', async () => {
    const txHash = 'burn-tx-hash-123';
    mockBurnAsset.mockResolvedValueOnce(txHash);
    mockQuery.mockResolvedValueOnce([]); // UPDATE tokens query

    const response = await request(app).post('/api/v1/tokens/burn').send(validBurnRequest);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { txHash } });

    expect(mockBurnAsset).toHaveBeenCalledWith({
      holderSecret: holderKeypair.secret(),
      assetCode: 'ECO',
      assetIssuer: issuerKeypair.publicKey(),
      amount: '100.0000000',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tokens SET total_supply = total_supply - $1'),
      ['100.0000000', 'ECO', issuerKeypair.publicKey()]
    );
  });

  it('validates required fields', async () => {
    const response = await request(app).post('/api/v1/tokens/burn').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
    expect(mockBurnAsset).not.toHaveBeenCalled();
  });

  it('validates holder secret format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/burn')
      .send({
        ...validBurnRequest,
        holderSecret: 'invalid-secret',
      });

    expect(response.status).toBe(400);
    expect(mockBurnAsset).not.toHaveBeenCalled();
  });

  it('validates asset code format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/burn')
      .send({
        ...validBurnRequest,
        assetCode: 'invalid-asset-code!',
      });

    expect(response.status).toBe(400);
    expect(mockBurnAsset).not.toHaveBeenCalled();
  });

  it('validates asset issuer format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/burn')
      .send({
        ...validBurnRequest,
        assetIssuer: 'invalid-issuer',
      });

    expect(response.status).toBe(400);
    expect(mockBurnAsset).not.toHaveBeenCalled();
  });

  it('validates amount format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/burn')
      .send({
        ...validBurnRequest,
        amount: 'invalid-amount',
      });

    expect(response.status).toBe(400);
    expect(mockBurnAsset).not.toHaveBeenCalled();
  });

  it('handles Stellar transaction failure', async () => {
    const horizonError = {
      response: {
        status: 422,
        data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } },
      },
    };
    mockBurnAsset.mockRejectedValueOnce(horizonError);

    const response = await request(app).post('/api/v1/tokens/burn').send(validBurnRequest);

    expect(response.status).toBe(422);
    expect(response.body.data).toBeNull();
    expect(response.body.error).toBeDefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('handles non-Horizon errors', async () => {
    const genericError = new Error('Network error');
    mockBurnAsset.mockRejectedValueOnce(genericError);

    const response = await request(app).post('/api/v1/tokens/burn').send(validBurnRequest);

    expect(response.status).toBe(500);
  });
});
