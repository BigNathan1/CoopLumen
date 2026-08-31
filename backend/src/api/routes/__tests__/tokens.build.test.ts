import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { buildUnsignedIssueAsset } from '../../../contracts/assets';
import { buildUnsignedTrustline } from '../../../contracts/trustlines';
import { submitSignedXdr } from '../../../contracts/transactions';

jest.mock('../../../contracts/assets', () => ({
  buildUnsignedIssueAsset: jest.fn(),
}));

jest.mock('../../../contracts/trustlines', () => ({
  buildUnsignedTrustline: jest.fn(),
}));

jest.mock('../../../contracts/transactions', () => ({
  submitSignedXdr: jest.fn(),
}));

const mockBuildUnsignedIssueAsset = buildUnsignedIssueAsset as jest.Mock;
const mockBuildUnsignedTrustline = buildUnsignedTrustline as jest.Mock;
const mockSubmitSignedXdr = submitSignedXdr as jest.Mock;

const issuerKeypair = Keypair.random();
const distributorKeypair = Keypair.random();
const accountKeypair = Keypair.random();

describe('POST /api/v1/tokens/build-issue', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const validRequest = {
    issuerPublicKey: issuerKeypair.publicKey(),
    assetCode: 'ECO',
    distributorPublicKey: distributorKeypair.publicKey(),
    amount: '1000.0000000',
  };

  it('returns an unsigned XDR built from public keys only, ignoring any secret field sent alongside it', async () => {
    mockBuildUnsignedIssueAsset.mockResolvedValueOnce('unsigned-xdr');

    const response = await request(app)
      .post('/api/v1/tokens/build-issue')
      .send({ ...validRequest, issuerSecret: 'SBOGUSSECRETSHOULDNEVERBEFORWARDED' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { xdr: 'unsigned-xdr' } });
    expect(mockBuildUnsignedIssueAsset).toHaveBeenCalledWith({
      issuerPublicKey: issuerKeypair.publicKey(),
      assetCode: 'ECO',
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '1000.0000000',
      memo: undefined,
    });
  });

  it('validates required fields', async () => {
    const response = await request(app).post('/api/v1/tokens/build-issue').send({});

    expect(response.status).toBe(400);
    expect(mockBuildUnsignedIssueAsset).not.toHaveBeenCalled();
  });

  it('rejects an issuerPublicKey that is not a valid Stellar public key', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/build-issue')
      .send({ ...validRequest, issuerPublicKey: 'not-a-key' });

    expect(response.status).toBe(400);
    expect(mockBuildUnsignedIssueAsset).not.toHaveBeenCalled();
  });

  it('maps a Horizon failure to the mapped error response', async () => {
    mockBuildUnsignedIssueAsset.mockRejectedValueOnce({ response: { status: 404 } });

    const response = await request(app).post('/api/v1/tokens/build-issue').send(validRequest);

    expect(response.status).toBe(404);
    expect(response.body.data).toBeNull();
  });
});

describe('POST /api/v1/tokens/build-trustline', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const validRequest = {
    accountPublicKey: accountKeypair.publicKey(),
    assetCode: 'ECO',
    assetIssuer: issuerKeypair.publicKey(),
  };

  it('returns an unsigned changeTrust XDR built from public keys only', async () => {
    mockBuildUnsignedTrustline.mockResolvedValueOnce('unsigned-trustline-xdr');

    const response = await request(app).post('/api/v1/tokens/build-trustline').send(validRequest);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { xdr: 'unsigned-trustline-xdr' } });
    expect(mockBuildUnsignedTrustline).toHaveBeenCalledWith({
      accountPublicKey: accountKeypair.publicKey(),
      assetCode: 'ECO',
      assetIssuer: issuerKeypair.publicKey(),
      limit: undefined,
    });
  });

  it('validates required fields', async () => {
    const response = await request(app).post('/api/v1/tokens/build-trustline').send({});

    expect(response.status).toBe(400);
    expect(mockBuildUnsignedTrustline).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/tokens/submit', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('submits a client-signed XDR and returns the transaction hash', async () => {
    mockSubmitSignedXdr.mockResolvedValueOnce('tx-hash-submitted');

    const response = await request(app)
      .post('/api/v1/tokens/submit')
      .send({ signedXdr: 'signed-xdr-blob' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { txHash: 'tx-hash-submitted' } });
    expect(mockSubmitSignedXdr).toHaveBeenCalledWith('signed-xdr-blob');
  });

  it('validates that signedXdr is present', async () => {
    const response = await request(app).post('/api/v1/tokens/submit').send({});

    expect(response.status).toBe(400);
    expect(mockSubmitSignedXdr).not.toHaveBeenCalled();
  });

  it('returns 400 when the XDR cannot be parsed', async () => {
    mockSubmitSignedXdr.mockRejectedValueOnce(new Error('Invalid XDR'));

    const response = await request(app)
      .post('/api/v1/tokens/submit')
      .send({ signedXdr: 'not-valid-xdr' });

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
  });

  it('maps a Horizon rejection', async () => {
    mockSubmitSignedXdr.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { extras: { result_codes: { operations: ['op_no_trust'] } } },
      },
    });

    const response = await request(app)
      .post('/api/v1/tokens/submit')
      .send({ signedXdr: 'signed-xdr-blob' });

    expect(response.status).toBe(422);
    expect(response.body.data).toBeNull();
  });
});
