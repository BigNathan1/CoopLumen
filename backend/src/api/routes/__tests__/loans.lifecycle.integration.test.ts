/**
 * Integration tests for the full loan lifecycle: request → fund → repay
 * Tests the end-to-end flow of a community pool loan from creation to repayment.
 */

import request from 'supertest';
import { Pool } from 'pg';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { db } from '../../../db';
import { setupTestDatabase } from '../../../testing/setup';
import { teardownTestSuite } from '../../../testing/teardown';
import { createSessionToken } from '../../utils/sessionToken';

const RUN_INTEGRATION = Boolean(process.env.DATABASE_URL);
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

describeIntegration('Loan lifecycle: request → fund → repay (integration)', () => {
  let pool: Pool;
  let testCommunityId: string;
  let testCommunityAssetCode: string;
  let testCommunityAssetIssuer: string;
  let testCommunityIssuerPublicKey: string;

  const borrowerKeypair = Keypair.random();
  const lenderKeypair = Keypair.random();

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { seeded } = await setupTestDatabase({ pool, seed: true });
    testCommunityId = seeded?.eco.id ?? '';
    testCommunityAssetCode = seeded?.eco.asset_code ?? '';
    testCommunityAssetIssuer = seeded?.eco.asset_issuer ?? '';
    testCommunityIssuerPublicKey = seeded?.eco.issuer_public_key ?? '';

    // Register test borrower and lender as members of the test community
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO members (community_id, stellar_address, role)
         VALUES ($1, $2, 'member'), ($1, $3, 'member')
         ON CONFLICT (community_id, stellar_address) DO UPDATE
         SET role = EXCLUDED.role`,
        [testCommunityId, borrowerKeypair.publicKey(), lenderKeypair.publicKey()]
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await teardownTestSuite({ pool, closePool: true });
    await db.end();
  });

  function authHeader(keypair: Keypair): string {
    return `Bearer ${createSessionToken(keypair.publicKey()).token}`;
  }

  it('completes full loan lifecycle: request → fund → repay → reputation updated', async () => {
    // ========== STEP 1: Request a loan ==========
    const loanAmount = '1000';
    const dueAt = new Date(Date.now() + 86400000).toISOString(); // 1 day from now

    const requestRes = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrowerKeypair))
      .send({
        communityId: testCommunityId,
        amount: loanAmount,
        purpose: 'Test loan for integration test',
        dueAt,
        interestRate: 5, // 5% interest
      })
      .expect(201);

    expect(requestRes.body.data).toBeDefined();
    expect(requestRes.body.data.status).toBe('pending');
    expect(requestRes.body.data.amount).toBe('1000.0000000');
    expect(requestRes.body.data.interest_rate).toBe('5.00');
    expect(requestRes.body.data.total_due).toBe('1050.0000000'); // 1000 + 5%
    expect(requestRes.body.data.outstanding).toBe('1050.0000000');
    expect(requestRes.body.data.borrower_address).toBe(borrowerKeypair.publicKey());
    expect(requestRes.body.data.lender_address).toBe(testCommunityIssuerPublicKey);
    expect(requestRes.body.data.asset_code).toBe(testCommunityAssetCode);
    expect(requestRes.body.data.asset_issuer).toBe(testCommunityAssetIssuer);

    const loanId = requestRes.body.data.id;
    expect(loanId).toBeDefined();

    // Verify loan event was created
    const eventsRes = await request(app)
      .get(`/api/v1/loans/${loanId}/events`)
      .set('Authorization', authHeader(borrowerKeypair))
      .expect(200);

    expect(eventsRes.body.data).toHaveLength(1);
    expect(eventsRes.body.data[0].event_type).toBe('created');

    // ========== STEP 2: Fund/Disburse the loan (lender = community issuer) ==========
    const disburseRes = await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lenderKeypair)) // In pool loans, lender is community issuer
      .send({
        stellarTxHash: 'test-tx-hash-123',
        note: 'Loan disbursed to borrower',
      })
      .expect(200);

    expect(disburseRes.body.data).toBeDefined();
    expect(disburseRes.body.data.status).toBe('active');
    expect(disburseRes.body.data.disbursed_at).toBeDefined();

    // Verify disbursement event
    const eventsAfterDisburse = await request(app)
      .get(`/api/v1/loans/${loanId}/events`)
      .set('Authorization', authHeader(borrowerKeypair))
      .expect(200);

    expect(eventsAfterDisburse.body.data).toHaveLength(2);
    expect(eventsAfterDisburse.body.data[1].event_type).toBe('disbursed');

    // ========== STEP 3: Repay the loan in full ==========
    const totalDue = '1050.0000000'; // 1000 principal + 5% interest

    const repayRes = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrowerKeypair))
      .send({
        amount: totalDue,
        paymentId: '11111111-1111-4111-8111-111111111111',
        note: 'Full repayment',
      })
      .expect(200);

    expect(repayRes.body.data).toBeDefined();
    expect(repayRes.body.data.status).toBe('repaid');
    expect(repayRes.body.data.amount_repaid).toBe(totalDue);
    expect(repayRes.body.data.closed_at).toBeDefined();

    // Verify repayment and closed events
    const eventsAfterRepay = await request(app)
      .get(`/api/v1/loans/${loanId}/events`)
      .set('Authorization', authHeader(borrowerKeypair))
      .expect(200);

    expect(eventsAfterRepay.body.data).toHaveLength(4); // created, disbursed, repayment, closed
    const repaymentEvent = eventsAfterRepay.body.data.find(
      (e: any) => e.event_type === 'repayment'
    );
    const closedEvent = eventsAfterRepay.body.data.find((e: any) => e.event_type === 'closed');
    expect(repaymentEvent).toBeDefined();
    expect(repaymentEvent.amount).toBe(totalDue);
    expect(closedEvent).toBeDefined();

    // ========== STEP 4: Verify reputation score was updated ==========
    const reputationRes = await request(app)
      .get(`/api/v1/reputation/${borrowerKeypair.publicKey()}`)
      .set('Authorization', authHeader(borrowerKeypair))
      .expect(200);

    expect(reputationRes.body.data).toBeDefined();
    expect(reputationRes.body.data.stellar_address).toBe(borrowerKeypair.publicKey());
    expect(reputationRes.body.data.community_id).toBe(testCommunityId);
    expect(reputationRes.body.data.on_time_repayments).toBe(1);
    expect(reputationRes.body.data.defaults).toBe(0);
    expect(reputationRes.body.data.total_loans).toBe(1);
    // Score should be > 50 due to successful repayment
    expect(reputationRes.body.data.score).toBeGreaterThan(50);
  });

  it('handles partial repayment then full repayment', async () => {
    const loanAmount = '2000';
    const dueAt = new Date(Date.now() + 86400000).toISOString();

    // Request loan
    const requestRes = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrowerKeypair))
      .send({
        communityId: testCommunityId,
        amount: loanAmount,
        purpose: 'Partial repayment test',
        dueAt,
        interestRate: 10, // 10% interest
      })
      .expect(201);

    const loanId = requestRes.body.data.id;
    const totalDue = '2200.0000000'; // 2000 + 10%

    // Disburse
    await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lenderKeypair))
      .send({})
      .expect(200);

    // Partial repayment (half)
    const partialRepay = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrowerKeypair))
      .send({ amount: '1100', note: 'Partial repayment' })
      .expect(200);

    expect(partialRepay.body.data.status).toBe('active');
    expect(partialRepay.body.data.amount_repaid).toBe('1100.0000000');
    expect(partialRepay.body.data.outstanding).toBe('1100.0000000');

    // Full repayment (remaining half)
    const fullRepay = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrowerKeypair))
      .send({ amount: '1100', note: 'Final repayment' })
      .expect(200);

    expect(fullRepay.body.data.status).toBe('repaid');
    expect(fullRepay.body.data.amount_repaid).toBe(totalDue);

    // Verify reputation shows 1 on-time repayment
    const reputationRes = await request(app)
      .get(`/api/v1/reputation/${borrowerKeypair.publicKey()}`)
      .set('Authorization', authHeader(borrowerKeypair))
      .expect(200);

    expect(reputationRes.body.data.on_time_repayments).toBe(1);
  });

  it('rejects repayment exceeding outstanding balance', async () => {
    const loanAmount = '500';
    const dueAt = new Date(Date.now() + 86400000).toISOString();

    const requestRes = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrowerKeypair))
      .send({
        communityId: testCommunityId,
        amount: loanAmount,
        purpose: 'Overpayment test',
        dueAt,
        interestRate: 0,
      })
      .expect(201);

    const loanId = requestRes.body.data.id;

    await request(app)
      .post(`/api/v1/loans/${loanId}/disburse`)
      .set('Authorization', authHeader(lenderKeypair))
      .send({})
      .expect(200);

    // Try to repay more than outstanding
    const overpayRes = await request(app)
      .post(`/api/v1/loans/${loanId}/repay`)
      .set('Authorization', authHeader(borrowerKeypair))
      .send({ amount: '600' }) // Outstanding is 500
      .expect(400);

    expect(overpayRes.body.error).toBe('Repayment exceeds outstanding balance');
    expect(overpayRes.body.meta.outstanding).toBe('500.0000000');
  });

  it('enforces loan-to-value limit based on token holdings', async () => {
    // This test verifies the LTV limit is enforced
    // The seeded test communities have community_settings with ltvLimit
    const loanAmount = '1000000'; // Very large amount that should exceed LTV
    const dueAt = new Date(Date.now() + 86400000).toISOString();

    const requestRes = await request(app)
      .post('/api/v1/loans/request')
      .set('Authorization', authHeader(borrowerKeypair))
      .send({
        communityId: testCommunityId,
        amount: loanAmount,
        purpose: 'LTV limit test',
        dueAt,
        interestRate: 5,
      });

    // Should be rejected with 400 due to LTV limit
    expect(requestRes.status).toBe(400);
    expect(requestRes.body.error).toBe('Loan request exceeds loan-to-value limit');
    expect(requestRes.body.meta).toBeDefined();
    expect(requestRes.body.meta.maxLoanAmount).toBeDefined();
    expect(requestRes.body.meta.tokenBalance).toBeDefined();
    expect(requestRes.body.meta.ltvLimit).toBeDefined();
  });
});
