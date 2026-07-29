import request from 'supertest';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import app from '../../../app';
import { StellarService } from '../../../contracts/stellar';

jest.mock('../../../contracts/stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn(),
  },
}));

jest.mock('@stellar/stellar-sdk', () => ({
  ...jest.requireActual('@stellar/stellar-sdk'),
  TransactionBuilder: {
    ...jest.requireActual('@stellar/stellar-sdk').TransactionBuilder,
    fromXDR: jest.fn(),
  },
}));

const mockStellar = StellarService as jest.Mocked<typeof StellarService>;
const mockFromXDR = TransactionBuilder.fromXDR as jest.Mock;

describe('POST /api/v1/tokens/transfer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockStellar.getNetwork.mockReturnValue('test-network');
  });

  it('rejects an empty body', async () => {
    const response = await request(app).post('/api/v1/tokens/transfer').send({});

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.meta.errors).toBeDefined();
    expect(mockFromXDR).not.toHaveBeenCalled();
  });

  it('rejects an XDR that fails to parse', async () => {
    mockFromXDR.mockImplementationOnce(() => {
      throw new Error('invalid XDR');
    });

    const response = await request(app)
      .post('/api/v1/tokens/transfer')
      .send({ signedXdr: 'not-valid-xdr' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/not a valid transaction/);
  });

  it('rejects a transaction that is not a single payment operation', async () => {
    mockFromXDR.mockReturnValueOnce({ operations: [{ type: 'createAccount' }] });

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/exactly one payment operation/);
  });

  it('submits a valid signed payment transaction', async () => {
    mockFromXDR.mockReturnValueOnce({ operations: [{ type: 'payment' }] });
    const submitTransaction = jest.fn().mockResolvedValueOnce({ hash: 'tx-hash-1' });
    mockStellar.getServer.mockReturnValue({ submitTransaction } as never);

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { txHash: 'tx-hash-1' } });
  });

  it('maps a Horizon submission failure to an actionable message', async () => {
    mockFromXDR.mockReturnValueOnce({ operations: [{ type: 'payment' }] });
    const submitTransaction = jest.fn().mockRejectedValueOnce({
      response: { data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } },
    });
    mockStellar.getServer.mockReturnValue({ submitTransaction } as never);

    const response = await request(app).post('/api/v1/tokens/transfer').send({ signedXdr: 'AAAA' });

    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/stale/);
  });
});
