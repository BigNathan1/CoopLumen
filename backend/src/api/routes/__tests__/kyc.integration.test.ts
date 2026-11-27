import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { Pool } from 'pg';
import app from '../../../app';
import { db } from '../../../db';
import { setupTestDatabase } from '../../../testing/setup';

const RUN_INTEGRATION = Boolean(process.env.DATABASE_URL);
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

/** Runs the KYC status route against the migrated schema rather than a mocked db. */
describeIntegration('GET /api/v1/kyc/status/:address (integration)', () => {
  let pool: Pool;
  const verified = Keypair.random().publicKey();
  const unverified = Keypair.random().publicKey();

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await setupTestDatabase({ pool });
    await pool.query(
      `INSERT INTO worldid_verifications (user_id, nullifier_hash, verification_level)
       VALUES ($1, $2, 'orb')`,
      [verified, `nullifier-${verified}`]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM worldid_verifications WHERE user_id = $1', [verified]);
    await pool.end();
    await db.end();
  });

  it('reports the World ID level recorded for a verified account', async () => {
    const res = await request(app).get(`/api/v1/kyc/status/${verified}`);

    expect(res.status).toBe(200);
    expect(res.body.data.worldId).toMatchObject({ verified: true, verificationLevel: 'orb' });
  });

  it('reports an account with no verification as unverified', async () => {
    const res = await request(app).get(`/api/v1/kyc/status/${unverified}`);

    expect(res.status).toBe(200);
    expect(res.body.data.worldId).toEqual({
      verified: false,
      verifiedAt: null,
      verificationLevel: null,
    });
  });

  it('rejects a level the World ID flow never issues', async () => {
    await expect(
      pool.query(
        `INSERT INTO worldid_verifications (user_id, nullifier_hash, verification_level)
         VALUES ($1, $2, 'passport')`,
        [unverified, `nullifier-${unverified}`]
      )
    ).rejects.toThrow(/worldid_verifications_level_check/);
  });
});
