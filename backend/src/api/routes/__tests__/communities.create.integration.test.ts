/**
 * Integration tests for POST /api/v1/communities
 * Tests success scenarios, duplicate name handling, and invalid key validation
 * Issue #373 [#295]
 */

import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { Pool } from 'pg';
import app from '../../../app';
import { db } from '../../../db';
import { makeTestPool, seedTestDatabase, truncateAll } from '../../../testing/fixtures';
import { createSessionToken } from '../../utils/sessionToken';

const RUN = Boolean(process.env.DATABASE_URL);
const describeIf = RUN ? describe : describe.skip;

function authHeader(address: string): string {
  return `Bearer ${createSessionToken(address).token}`;
}

describeIf('POST /api/v1/communities (success, duplicate name, invalid key)', () => {
  let pool: Pool;
  const issuer = Keypair.random().publicKey();
  const otherIssuer = Keypair.random().publicKey();

  beforeAll(async () => {
    pool = makeTestPool();
    const client = await pool.connect();
    try {
      await seedTestDatabase(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await truncateAll(client);
    } finally {
      client.release();
    }
    await pool.end();
    await db.end();
  });

  describe('Success scenarios', () => {
    it('creates a community with all required fields', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Success DAO',
          description: 'A successfully created community',
          issuerPublicKey: issuer,
          assetCode: 'SUCC',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Success DAO');
      expect(res.body.data.description).toBe('A successfully created community');
      expect(res.body.data.issuer_public_key).toBe(issuer);
      expect(res.body.data.asset_code).toBe('SUCC');
      expect(res.body.data.asset_issuer).toBe(issuer);
      expect(res.body.data).toHaveProperty('created_at');
      expect(res.body.data).toHaveProperty('updated_at');
      expect(res.body.data.deleted_at).toBeNull();
      expect(res.body.data.settings).toEqual({});
    });

    it('creates a community without optional description', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Minimal DAO',
          issuerPublicKey: issuer,
          assetCode: 'MIN',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Minimal DAO');
      expect(res.body.data.description).toBeNull();
    });

    it('automatically adds the creator as the first admin member', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Creator Admin DAO',
          issuerPublicKey: issuer,
          assetCode: 'CREA',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(201);
      const communityId = res.body.data.id;

      // Verify the creator is listed as admin
      const members = await request(app).get(`/api/v1/communities/${communityId}/members`);
      expect(members.status).toBe(200);
      expect(members.body.meta.total).toBe(1);
      expect(members.body.data[0].stellar_address).toBe(issuer);
      expect(members.body.data[0].role).toBe('admin');
    });

    it('records a community_created transaction log entry', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Logged DAO',
          issuerPublicKey: issuer,
          assetCode: 'LOG',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(201);
      const communityId = res.body.data.id;

      // Verify transaction log
      const rows = await db.query<{ action: string; community_id: string; actor_address: string }>(
        `SELECT action, community_id, actor_address FROM transactions_log WHERE community_id = $1`,
        [communityId]
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      const createdLog = rows.find((r) => r.action === 'community_created');
      expect(createdLog).toBeDefined();
      expect(createdLog?.actor_address).toBe(issuer);
    });

    it('allows different issuers to create communities', async () => {
      const res1 = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'First Issuer DAO',
          issuerPublicKey: issuer,
          assetCode: 'FIR',
          assetIssuer: issuer,
        });

      const res2 = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(otherIssuer))
        .send({
          name: 'Second Issuer DAO',
          issuerPublicKey: otherIssuer,
          assetCode: 'SEC',
          assetIssuer: otherIssuer,
        });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.data.id).not.toBe(res2.body.data.id);
    });
  });

  describe('Duplicate name handling', () => {
    beforeAll(async () => {
      // Create a reference community
      await request(app).post('/api/v1/communities').set('Authorization', authHeader(issuer)).send({
        name: 'Duplicate Test DAO',
        issuerPublicKey: issuer,
        assetCode: 'DUP',
        assetIssuer: issuer,
      });
    });

    it('rejects duplicate community name with 409 status', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Duplicate Test DAO',
          issuerPublicKey: issuer,
          assetCode: 'DUP2',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(409);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error.code).toBe('COMMUNITY_NAME_EXISTS');
      expect(res.body.error).toHaveProperty('message');
    });

    it('performs case-insensitive duplicate name check', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'duplicate test dao',
          issuerPublicKey: issuer,
          assetCode: 'DUP3',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('COMMUNITY_NAME_EXISTS');
    });

    it('trims whitespace in duplicate name check', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: '  Duplicate Test DAO  ',
          issuerPublicKey: issuer,
          assetCode: 'DUP4',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('COMMUNITY_NAME_EXISTS');
    });

    it('allows similar but different names', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Duplicate Test DAO Plus',
          issuerPublicKey: issuer,
          assetCode: 'DPLZ',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Duplicate Test DAO Plus');
    });

    it('allows reusing name of soft-deleted community', async () => {
      // Create and delete a community
      const created = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Temporary DAO',
          issuerPublicKey: issuer,
          assetCode: 'TEMP',
          assetIssuer: issuer,
        });
      expect(created.status).toBe(201);

      const deleted = await request(app)
        .delete(`/api/v1/communities/${created.body.data.id}`)
        .set('Authorization', authHeader(issuer));
      expect(deleted.status).toBe(200);

      // Try creating with the same name
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Temporary DAO',
          issuerPublicKey: issuer,
          assetCode: 'TMP2',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Temporary DAO');
    });
  });

  describe('Invalid key validation', () => {
    it('rejects invalid issuerPublicKey format', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Invalid Issuer DAO',
          issuerPublicKey: 'INVALID_KEY_12345',
          assetCode: 'INV',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toBeDefined();
    });

    it('rejects invalid assetIssuer format', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Invalid Asset DAO',
          issuerPublicKey: issuer,
          assetCode: 'INV',
          assetIssuer: 'NOT_A_VALID_STELLAR_KEY',
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toBeDefined();
    });

    it('rejects when authenticated address does not match issuerPublicKey', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Mismatched Auth DAO',
          issuerPublicKey: otherIssuer,
          assetCode: 'MIS',
          assetIssuer: otherIssuer,
        });

      expect(res.status).toBe(403);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toBeDefined();
      expect(res.body.error).toContain('issuerPublicKey must be the authenticated address');
    });

    it('requires authentication', async () => {
      const res = await request(app).post('/api/v1/communities').send({
        name: 'Unauthenticated DAO',
        issuerPublicKey: issuer,
        assetCode: 'UNA',
        assetIssuer: issuer,
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Required field validation', () => {
    it('rejects request missing name', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          issuerPublicKey: issuer,
          assetCode: 'MISS',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects request missing issuerPublicKey', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Missing Issuer DAO',
          assetCode: 'MISS',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects request missing assetCode', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Missing Asset Code DAO',
          issuerPublicKey: issuer,
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects request missing assetIssuer', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Missing Asset Issuer DAO',
          issuerPublicKey: issuer,
          assetCode: 'MISS',
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });
  });

  describe('Field validation constraints', () => {
    it('rejects name shorter than 2 characters', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'A',
          issuerPublicKey: issuer,
          assetCode: 'SHR',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects name longer than 64 characters', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'A'.repeat(65),
          issuerPublicKey: issuer,
          assetCode: 'LNG',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('accepts name at minimum length (2 characters)', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'AB',
          issuerPublicKey: issuer,
          assetCode: 'MIN2',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('AB');
    });

    it('accepts name at maximum length (64 characters)', async () => {
      const longName = 'A'.repeat(64);
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: longName,
          issuerPublicKey: issuer,
          assetCode: 'MAX64',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(longName);
    });

    it('rejects description longer than 500 characters', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Long Description DAO',
          description: 'A'.repeat(501),
          issuerPublicKey: issuer,
          assetCode: 'LDSC',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects assetCode longer than 12 characters', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Long Asset Code DAO',
          issuerPublicKey: issuer,
          assetCode: 'TOOLONGCODE12',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects empty assetCode', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(issuer))
        .send({
          name: 'Empty Asset Code DAO',
          issuerPublicKey: issuer,
          assetCode: '',
          assetIssuer: issuer,
        });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });
  });
});
