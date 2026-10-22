import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { createSessionToken } from '../../utils/sessionToken';
import { buildUnsignedIssueAsset } from '../../../contracts/assets';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock('../../../contracts/assets', () => ({
  buildUnsignedIssueAsset: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockBuildUnsignedIssueAsset = buildUnsignedIssueAsset as jest.Mock;

const communityId = '11111111-1111-4111-8111-111111111111';
const issuerKeypair = Keypair.random();
const distributorKeypair = Keypair.random();
const callerKeypair = Keypair.random();

function authHeader(keypair = callerKeypair): string {
  return `Bearer ${createSessionToken(keypair.publicKey()).token}`;
}

describe('POST /api/v1/tokens/build-issue RBAC guards', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const validRequest = {
    communityId,
    issuerPublicKey: issuerKeypair.publicKey(),
    assetCode: 'LUMEN',
    distributorPublicKey: distributorKeypair.publicKey(),
    amount: '500.0000000',
  };

  it('rejects unauthenticated caller with 401', async () => {
    const res = await request(app).post('/api/v1/tokens/build-issue').send(validRequest);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ data: null, error: 'Authentication required' });
    expect(mockBuildUnsignedIssueAsset).not.toHaveBeenCalled();
  });

  it('rejects caller with role member with 403', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'member' }]);

    const res = await request(app)
      .post('/api/v1/tokens/build-issue')
      .set('Authorization', authHeader())
      .send(validRequest);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Requires community role: admin or treasurer');
    expect(mockBuildUnsignedIssueAsset).not.toHaveBeenCalled();
  });

  it('rejects caller with role observer with 403', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'observer' }]);

    const res = await request(app)
      .post('/api/v1/tokens/build-issue')
      .set('Authorization', authHeader())
      .send(validRequest);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Requires community role: admin or treasurer');
    expect(mockBuildUnsignedIssueAsset).not.toHaveBeenCalled();
  });

  it('allows caller with role admin', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'admin' }]);
    mockBuildUnsignedIssueAsset.mockResolvedValueOnce('unsigned-issue-xdr');

    const res = await request(app)
      .post('/api/v1/tokens/build-issue')
      .set('Authorization', authHeader())
      .send(validRequest);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { xdr: 'unsigned-issue-xdr' } });
    expect(mockBuildUnsignedIssueAsset).toHaveBeenCalledWith({
      issuerPublicKey: issuerKeypair.publicKey(),
      assetCode: 'LUMEN',
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '500.0000000',
      memo: undefined,
    });
  });

  it('allows caller with role treasurer', async () => {
    mockDb.query.mockResolvedValueOnce([{ role: 'treasurer' }]);
    mockBuildUnsignedIssueAsset.mockResolvedValueOnce('unsigned-issue-xdr');

    const res = await request(app)
      .post('/api/v1/tokens/build-issue')
      .set('Authorization', authHeader())
      .send(validRequest);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { xdr: 'unsigned-issue-xdr' } });
  });

  it('resolves communityId by issuerPublicKey if communityId is not passed', async () => {
    const reqWithoutCommunityId = {
      issuerPublicKey: validRequest.issuerPublicKey,
      assetCode: validRequest.assetCode,
      distributorPublicKey: validRequest.distributorPublicKey,
      amount: validRequest.amount,
    };
    mockDb.query
      .mockResolvedValueOnce([{ id: communityId }]) // lookup community by issuer_public_key
      .mockResolvedValueOnce([{ role: 'treasurer' }]); // role check
    mockBuildUnsignedIssueAsset.mockResolvedValueOnce('unsigned-issue-xdr');

    const res = await request(app)
      .post('/api/v1/tokens/build-issue')
      .set('Authorization', authHeader())
      .send(reqWithoutCommunityId);

    expect(res.status).toBe(200);
    expect(mockDb.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'SELECT id FROM communities WHERE (issuer_public_key = $1 OR asset_issuer = $1)'
      ),
      [issuerKeypair.publicKey()]
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /SELECT role FROM members[\s\S]*WHERE community_id = \$1 AND stellar_address = \$2/
      ),
      [communityId, callerKeypair.publicKey()]
    );
  });
});
