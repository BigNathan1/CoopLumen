import request from 'supertest';
import app from '../../../app';
import { db } from '../../../db';

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const communityId = '550e8400-e29b-41d4-a716-446655440000';
const requestId = '770e8400-e29b-41d4-a716-446655440000';
const proposerAddress = 'GB7QUZ7Z4C6C7DYXU4EB3OG4GLH5HSZX75QW2IQ3YSNKMGHWEJ5FCF6';
const cosigner1 = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
const cosigner2 = 'GDFR34N5CLX3A6W4PZGZZI55UGB7QUZ7Z4C6C7DYXU4EB3OG4GLH5HSZX';

describe('Multi-Sig Proposal -> Sign -> Execute Lifecycle Integration (Issue #418 / #496)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('completes the entire proposal -> sign (threshold 2) -> execute flow', async () => {
    // 1. Propose a MultiSig request
    const initialRequest = {
      id: requestId,
      community_id: communityId,
      proposer_address: proposerAddress,
      action: 'payment',
      title: 'Monthly Cooperative Dividend Payout',
      description: 'Disburse monthly dividend to active co-op members',
      payload: {
        recipients: [
          { address: cosigner1, amount: '100.0000000' },
          { address: cosigner2, amount: '150.0000000' },
        ],
      },
      transaction_xdr: 'AAAAAgAAAA...',
      required_signatures: 2,
      current_signatures: 0,
      status: 'pending',
      stellar_tx_hash: null,
      rejection_reason: null,
      expires_at: '2026-12-31T23:59:59.000Z',
      executed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockDb.query
      .mockResolvedValueOnce([{ id: communityId }]) // community existence check
      .mockResolvedValueOnce([initialRequest]); // insert into multisig_requests

    const proposeRes = await request(app)
      .post(`/api/v1/multisig/community/${communityId}`)
      .send({
        action: 'payment',
        title: 'Monthly Cooperative Dividend Payout',
        description: 'Disburse monthly dividend to active co-op members',
        payload: {
          recipients: [
            { address: cosigner1, amount: '100.0000000' },
            { address: cosigner2, amount: '150.0000000' },
          ],
        },
        transaction_xdr: 'AAAAAgAAAA...',
        required_signatures: 2,
        proposer_address: proposerAddress,
        expires_at: '2026-12-31T23:59:59.000Z',
      });

    expect(proposeRes.status).toBe(201);
    expect(proposeRes.body.data.id).toBe(requestId);
    expect(proposeRes.body.data.status).toBe('pending');
    expect(proposeRes.body.data.current_signatures).toBe(0);

    // 2. Query request details
    mockDb.query.mockResolvedValueOnce([initialRequest]);
    const detailRes = await request(app).get(`/api/v1/multisig/requests/${requestId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.status).toBe('pending');
    expect(detailRes.body.data.required_signatures).toBe(2);

    // 3. First Co-Signer approves (signatures: 1/2, status: pending)
    const afterFirstSign = {
      ...initialRequest,
      current_signatures: 1,
      status: 'pending',
      transaction_xdr: 'AAAAAgAAAA_SIGNED_1...',
    };

    mockDb.query
      .mockResolvedValueOnce([initialRequest]) // fetch current request
      .mockResolvedValueOnce([afterFirstSign]); // update request

    const sign1Res = await request(app)
      .post(`/api/v1/multisig/requests/${requestId}/approve`)
      .send({ signed_xdr: 'AAAAAgAAAA_SIGNED_1...' });

    expect(sign1Res.status).toBe(200);
    expect(sign1Res.body.data.current_signatures).toBe(1);
    expect(sign1Res.body.data.status).toBe('pending');

    // 4. Second Co-Signer approves (signatures: 2/2 >= required 2, status: approved)
    const afterSecondSign = {
      ...afterFirstSign,
      current_signatures: 2,
      status: 'approved',
      transaction_xdr: 'AAAAAgAAAA_FULLY_SIGNED...',
    };

    mockDb.query
      .mockResolvedValueOnce([afterFirstSign]) // fetch current request
      .mockResolvedValueOnce([afterSecondSign]); // update request to approved

    const sign2Res = await request(app)
      .post(`/api/v1/multisig/requests/${requestId}/approve`)
      .send({ signed_xdr: 'AAAAAgAAAA_FULLY_SIGNED...' });

    expect(sign2Res.status).toBe(200);
    expect(sign2Res.body.data.current_signatures).toBe(2);
    expect(sign2Res.body.data.status).toBe('approved');

    // 5. Execute the approved multi-sig transaction on-chain
    const txHash = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';
    const executedRequest = {
      ...afterSecondSign,
      status: 'executed',
      stellar_tx_hash: txHash,
      executed_at: new Date().toISOString(),
    };

    mockDb.query
      .mockResolvedValueOnce([afterSecondSign]) // fetch request for execute check
      .mockResolvedValueOnce([executedRequest]); // update request to executed

    const execRes = await request(app)
      .post(`/api/v1/multisig/requests/${requestId}/execute`)
      .send({ stellar_tx_hash: txHash });

    expect(execRes.status).toBe(200);
    expect(execRes.body.data.status).toBe('executed');
    expect(execRes.body.data.stellar_tx_hash).toBe(txHash);
    expect(execRes.body.data.executed_at).toBeDefined();
  });

  it('handles the rejection flow and prevents subsequent approval', async () => {
    const initialRequest = {
      id: requestId,
      community_id: communityId,
      proposer_address: proposerAddress,
      action: 'settings_update',
      title: 'Emergency Reserve Transfer',
      status: 'pending',
      current_signatures: 0,
      required_signatures: 2,
    };

    const rejectedRequest = {
      ...initialRequest,
      status: 'rejected',
      rejection_reason: 'Unauthorized emergency action requested',
    };

    // 1. Reject proposal
    mockDb.query.mockResolvedValueOnce([initialRequest]).mockResolvedValueOnce([rejectedRequest]);

    const rejectRes = await request(app)
      .post(`/api/v1/multisig/requests/${requestId}/reject`)
      .send({ reason: 'Unauthorized emergency action requested' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');
    expect(rejectRes.body.data.rejection_reason).toBe('Unauthorized emergency action requested');

    // 2. Subsequent approval attempt on rejected request must fail with 400
    mockDb.query.mockResolvedValueOnce([rejectedRequest]);
    const approveAfterRejectRes = await request(app)
      .post(`/api/v1/multisig/requests/${requestId}/approve`)
      .send({ signed_xdr: 'AAAA...' });

    expect(approveAfterRejectRes.status).toBe(400);
    expect(approveAfterRejectRes.body.error).toContain(
      "Cannot approve request with status 'rejected'"
    );
  });

  it('rejects execution when proposal is in an invalid state', async () => {
    const rejectedRequest = {
      id: requestId,
      status: 'rejected',
    };

    mockDb.query.mockResolvedValueOnce([rejectedRequest]);

    const res = await request(app)
      .post(`/api/v1/multisig/requests/${requestId}/execute`)
      .send({ stellar_tx_hash: '1234567890abcdef' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot execute request with status 'rejected'");
  });
});
