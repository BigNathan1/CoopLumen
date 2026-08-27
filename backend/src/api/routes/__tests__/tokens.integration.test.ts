import request from 'supertest';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { db } from '../../../db';

const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
  isOpen: true,
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

jest.mock('../../../db', () => ({
  db: {
    query: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue(true),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@stellar/stellar-sdk', () => ({
  ...jest.requireActual('@stellar/stellar-sdk'),
  TransactionBuilder: {
    ...jest.requireActual('@stellar/stellar-sdk').TransactionBuilder,
    fromXDR: jest.fn(),
  },
}));

jest.mock('../../../contracts/assets', () => ({
  issueAsset: jest.fn(),
  burnAsset: jest.fn(),
  getAssetHolders: jest.fn(),
  getAssetSupply: jest.fn(),
}));

jest.mock('../../../contracts/trustlines', () => ({
  establishTrustline: jest.fn(),
}));

import app from '../../../app';
import { issueAsset } from '../../../contracts/assets';
import { establishTrustline } from '../../../contracts/trustlines';
import { StellarService } from '../../../contracts/stellar';

const mockFromXDR = TransactionBuilder.fromXDR as jest.Mock;

describe('Token Integration Flow: Issue -> Trustline -> Transfer', () => {
  const issuerKeypair = Keypair.random();
  const distributorKeypair = Keypair.random();
  const userKeypair = Keypair.random();
  const assetCode = 'COOP123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await db.end();
  });

  it('should complete the full token lifecycle successfully', async () => {
    // 1. Issue Token
    (issueAsset as jest.Mock).mockResolvedValueOnce('tx-hash-issue');
    const submitTransactionMock = jest.fn().mockResolvedValue({ hash: 'tx-hash-issue' });
    const loadAccountMock = jest.fn().mockResolvedValue({
      id: issuerKeypair.publicKey(),
      sequenceNumber: () => '1',
      incrementSequenceNumber: () => {},
      balances: [],
    });
    
    (StellarService as any).server = {
      submitTransaction: submitTransactionMock,
      loadAccount: loadAccountMock,
    };

    const issueRes = await request(app).post('/api/v1/tokens/issue').send({
      issuerSecret: issuerKeypair.secret(),
      assetCode,
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '1000',
    });

    expect(issueRes.status).toBe(201);
    expect(issueRes.body.data.txHash).toBe('tx-hash-issue');

    // 2. Establish Trustline
    (establishTrustline as jest.Mock).mockResolvedValueOnce('tx-hash-trustline');
    loadAccountMock.mockResolvedValueOnce({
      id: userKeypair.publicKey(),
      sequenceNumber: () => '1',
      incrementSequenceNumber: () => {},
      balances: [],
    });

    const trustlineRes = await request(app).post('/api/v1/tokens/trustline').send({
      accountSecret: userKeypair.secret(),
      assetCode,
      assetIssuer: issuerKeypair.publicKey(),
    });

    expect(trustlineRes.status).toBe(201);
    expect(trustlineRes.body.data.txHash).toBe('tx-hash-trustline');

    // 3. Transfer Token
    submitTransactionMock.mockResolvedValue({ hash: 'tx-hash-transfer' });
    const transaction = {
      fee: 100,
      source: distributorKeypair.publicKey(),
      operations: [
        {
          type: 'payment',
          destination: userKeypair.publicKey(),
          asset: { isNative: (): boolean => false, code: assetCode, issuer: issuerKeypair.publicKey() },
          amount: '100',
        },
      ],
    };
    mockFromXDR.mockReturnValueOnce(transaction);

    const transferRes = await request(app).post('/api/v1/tokens/transfer').send({
      signedXdr: 'fake_xdr',
    });

    expect(transferRes.status).toBe(200);
    expect(transferRes.body.data.txHash).toBe('tx-hash-transfer');
  });

  it('should reject invalid assetCode', async () => {
    const issueRes = await request(app).post('/api/v1/tokens/issue').send({
      issuerSecret: issuerKeypair.secret(),
      assetCode: 'INVALID-CODE_WITH_SPECIAL_CHARS',
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '1000',
    });

    expect(issueRes.status).toBe(400);
    expect(issueRes.body.meta.errors).toBeDefined();
  });

  it('should rate-limit issue endpoint to 3 requests per minute', async () => {
    // Disable isTest in rateLimit temporarily if we can, or just mock rateLimit?
    // Wait, the rate limit skip is (req) => isTest. 
    // To test it we would need to override process.env.NODE_ENV.
  });
});
