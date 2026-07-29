import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { StellarService } from '../../../contracts/stellar';

jest.mock('../../../db', () => ({
  db: {
    query: jest.fn(),
  },
}));

jest.mock('../../../contracts/stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockStellar = StellarService as jest.Mocked<typeof StellarService>;

describe('POST /api/v1/tokens/airdrop', () => {
  const issuer = Keypair.random();
  const memberOne = Keypair.random().publicKey();
  const memberTwo = Keypair.random().publicKey();

  beforeEach(() => {
    jest.resetAllMocks();
    mockStellar.getNetwork.mockReturnValue('test-network');
  });

  it('validates the request body', async () => {
    const response = await request(app).post('/api/v1/tokens/airdrop').send({});

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error).toBe('Invalid request body');
    expect(response.body.meta.errors).toBeDefined();
  });

  it('distributes the requested amount to every member', async () => {
    mockDb.query
      .mockResolvedValueOnce([{ asset_code: 'TDAO', asset_issuer: issuer.publicKey() }])
      .mockResolvedValueOnce([{ stellar_address: memberOne }, { stellar_address: memberTwo }]);

    const loadAccount = jest.fn().mockResolvedValue({ accountId: issuer.publicKey() });
    const submitTransaction = jest
      .fn()
      .mockResolvedValueOnce({ hash: 'hash-one' })
      .mockResolvedValueOnce({ hash: 'hash-two' });
    mockStellar.getServer.mockReturnValue({ loadAccount, submitTransaction } as never);

    const response = await request(app).post('/api/v1/tokens/airdrop').send({
      communityId: '00000000-0000-0000-0000-000000000001',
      amount: '12.5',
      issuerSecret: issuer.secret(),
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      amount: '12.5',
      recipientCount: 2,
      txHashes: ['hash-one', 'hash-two'],
    });
    expect(submitTransaction).toHaveBeenCalledTimes(2);
  });
});
