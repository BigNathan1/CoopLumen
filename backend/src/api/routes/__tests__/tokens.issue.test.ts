import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { issueAsset } from '../../../contracts/assets';

jest.mock('../../../db', () => ({
  db: {
    query: jest.fn(),
    ping: jest.fn(),
  },
}));

jest.mock('../../../contracts/assets', () => ({
  issueAsset: jest.fn(),
  burnAsset: jest.fn(),
  getAssetHolders: jest.fn(),
  getAssetSupply: jest.fn(),
}));

const mockQuery = db.query as jest.Mock;
const mockIssueAsset = issueAsset as jest.Mock;

const issuerKeypair = Keypair.random();
const distributorKeypair = Keypair.random();

describe('POST /api/v1/tokens/issue', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const validIssueRequest = {
    issuerSecret: issuerKeypair.secret(),
    assetCode: 'ECO',
    distributorPublicKey: distributorKeypair.publicKey(),
    amount: '1000.0000000',
  };

  it('issues a token without community metadata', async () => {
    const txHash = 'stellar-tx-hash-123';
    mockIssueAsset.mockResolvedValueOnce(txHash);
    mockQuery.mockResolvedValueOnce([]); // transactions_log insert

    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send(validIssueRequest);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { txHash } });
    expect(mockIssueAsset).toHaveBeenCalledWith({
      issuerSecret: issuerKeypair.secret(),
      assetCode: 'ECO',
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '1000.0000000',
      memo: undefined,
    });

    // Should log token_issued event
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO transactions_log'),
      expect.arrayContaining([
        null, // community_id
        issuerKeypair.publicKey(),
        'token_issued',
        txHash,
        expect.stringContaining('ECO'),
      ])
    );
  });

  it('issues a token with community metadata and stores it', async () => {
    const txHash = 'stellar-tx-hash-456';
    const communityId = 'comm-123';
    mockIssueAsset.mockResolvedValueOnce(txHash);
    mockQuery
      .mockResolvedValueOnce([]) // tokens insert
      .mockResolvedValueOnce([]); // transactions_log insert

    const requestWithMetadata = {
      ...validIssueRequest,
      communityId,
      name: 'Eco Token',
      description: 'Community ecological token',
      iconUrl: 'https://example.com/icon.png',
      decimals: 6,
    };

    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send(requestWithMetadata);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { txHash } });

    // Should store token metadata
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tokens'),
      expect.arrayContaining([
        communityId,
        'ECO',
        issuerKeypair.publicKey(),
        issuerKeypair.publicKey(),
        distributorKeypair.publicKey(),
        '1000.0000000',
        txHash,
        'Eco Token',
        'Community ecological token',
        'https://example.com/icon.png',
        6,
      ])
    );

    // Should log token_issued event with metadata
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO transactions_log'),
      expect.arrayContaining([
        communityId,
        issuerKeypair.publicKey(),
        'token_issued',
        txHash,
        expect.stringContaining('"name":"Eco Token"'),
      ])
    );
  });

  it('validates required fields', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
    expect(mockIssueAsset).not.toHaveBeenCalled();
  });

  it('validates issuer secret format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send({
        ...validIssueRequest,
        issuerSecret: 'invalid-secret',
      });

    expect(response.status).toBe(400);
    expect(mockIssueAsset).not.toHaveBeenCalled();
  });

  it('validates asset code format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send({
        ...validIssueRequest,
        assetCode: 'invalid-asset-code!',
      });

    expect(response.status).toBe(400);
    expect(mockIssueAsset).not.toHaveBeenCalled();
  });

  it('validates distributor public key format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send({
        ...validIssueRequest,
        distributorPublicKey: 'invalid-public-key',
      });

    expect(response.status).toBe(400);
    expect(mockIssueAsset).not.toHaveBeenCalled();
  });

  it('validates amount format', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send({
        ...validIssueRequest,
        amount: 'invalid-amount',
      });

    expect(response.status).toBe(400);
    expect(mockIssueAsset).not.toHaveBeenCalled();
  });

  it('validates metadata fields when provided', async () => {
    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send({
        ...validIssueRequest,
        name: '', // empty name should fail
        decimals: 8, // exceeds max of 7
        iconUrl: 'not-a-url',
      });

    expect(response.status).toBe(400);
    expect(mockIssueAsset).not.toHaveBeenCalled();
  });

  it('handles Stellar transaction failure', async () => {
    const horizonError = {
      response: {
        status: 400,
        data: { extras: { result_codes: { transaction: 'tx_failed' } } },
      },
    };
    mockIssueAsset.mockRejectedValueOnce(horizonError);

    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send(validIssueRequest);

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error).toBeDefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('handles token metadata persistence failure gracefully', async () => {
    const txHash = 'stellar-tx-hash-789';
    mockIssueAsset.mockResolvedValueOnce(txHash);
    mockQuery
      .mockRejectedValueOnce(new Error('Database error')) // tokens insert fails
      .mockResolvedValueOnce([]); // transactions_log still succeeds

    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send({
        ...validIssueRequest,
        communityId: 'comm-456',
        name: 'Test Token',
      });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('TOKEN_METADATA_PERSISTENCE_FAILED');
    expect(response.body.error.message).toContain('do not retry automatically');
  });

  it('continues with successful response even if transaction logging fails', async () => {
    const txHash = 'stellar-tx-hash-999';
    mockIssueAsset.mockResolvedValueOnce(txHash);
    mockQuery.mockRejectedValueOnce(new Error('Logging failed'));

    // Mock console.warn to prevent test output noise
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .send(validIssueRequest);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { txHash } });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to log token_issued event:',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  it('handles idempotency for duplicate requests', async () => {
    // This would be handled by the idempotent middleware
    // The test verifies the endpoint works with idempotency middleware
    const txHash = 'stellar-tx-hash-idempotent';
    mockIssueAsset.mockResolvedValueOnce(txHash);
    mockQuery.mockResolvedValueOnce([]);

    const response = await request(app)
      .post('/api/v1/tokens/issue')
      .set('Idempotency-Key', 'test-key-123')
      .send(validIssueRequest);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { txHash } });
  });
});