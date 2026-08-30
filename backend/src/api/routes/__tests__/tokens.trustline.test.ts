import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { establishTrustline } from '../../../contracts/trustlines';

jest.mock('../../../contracts/trustlines', () => ({
  establishTrustline: jest.fn(),
}));

const mockEstablishTrustline = establishTrustline as jest.Mock;

const accountKeypair = Keypair.random();
const issuerKeypair = Keypair.random();

describe('POST /api/v1/tokens/trustline', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const validTrustlineRequest = {
    accountSecret: accountKeypair.secret(),
    assetCode: 'ECO',
    assetIssuer: issuerKeypair.publicKey(),
  };

  it('establishes a trustline successfully', async () => {
    const txHash = 'trustline-tx-hash-123';
    mockEstablishTrustline.mockResolvedValueOnce(txHash);

    const response = await request(app)
      .post('/api/v1/tokens/trustline')
      .send(validTrustlineRequest);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { txHash } });

    expect(mockEstablishTrustline).toHaveBeenCalledWith({
      accountSecret: accountKeypair.secret(),
      assetCode: 'ECO',
      assetIssuer: issuerKeypair.publicKey(),
      limit: undefined,
    });
  });

  it('establishes a trustline with a limit', async () => {
    const txHash = 'trustline-tx-hash-456';
    mockEstablishTrustline.mockResolvedValueOnce(txHash);

    const requestWithLimit = {
      ...validTrustlineRequest,
      limit: '1000.0000000',
    };

    const response = await request(app)
      .post('/api/v1/tokens/trustline')
      .send(requestWithLimit);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { txHash } });

    expect(mockEstablishTrustline).toHaveBeenCalledWith({
      accountSecret: accountKeypair.secret(),
      assetCode: 'ECO',
      assetIssuer: issuerKeypair.publicKey(),
      limit: '1000.0000000',
    });
  });

  it('validates required fields', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/trustline')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
    expect(mockEstablishTrustline).not.toHaveBeenCalled();
  });

  it('validates account secret format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/trustline')
      .send({
        ...validTrustlineRequest,
        accountSecret: 'invalid-secret',
      });

    expect(response.status).toBe(400);
    expect(mockEstablishTrustline).not.toHaveBeenCalled();
  });

  it('validates asset code format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/trustline')
      .send({
        ...validTrustlineRequest,
        assetCode: 'invalid-asset-code!',
      });

    expect(response.status).toBe(400);
    expect(mockEstablishTrustline).not.toHaveBeenCalled();
  });

  it('validates asset issuer format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/trustline')
      .send({
        ...validTrustlineRequest,
        assetIssuer: 'invalid-issuer',
      });

    expect(response.status).toBe(400);
    expect(mockEstablishTrustline).not.toHaveBeenCalled();
  });

  it('validates limit format when provided', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/trustline')
      .send({
        ...validTrustlineRequest,
        limit: 'invalid-limit',
      });

    expect(response.status).toBe(400);
    expect(mockEstablishTrustline).not.toHaveBeenCalled();
  });

  it('handles trustline establishment failure', async () => {
    const error = new Error('Trustline establishment failed');
    mockEstablishTrustline.mockRejectedValueOnce(error);

    const response = await request(app)
      .post('/api/v1/tokens/trustline')
      .send(validTrustlineRequest);

    expect(response.status).toBe(500);
  });
});