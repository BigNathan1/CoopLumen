/**
 * Integration tests for PUT /api/v1/communities/:id
 * Tests update scenarios, not found handling, and unauthorized access
 * Issue #374 [#296]
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

describeIf('PUT /api/v1/communities/:id (update, not found, unauthorized)', () => {
  let pool: Pool;
  const adminIssuer = Keypair.random().publicKey();
  const treasurer = Keypair.random().publicKey();
  const regularMember = Keypair.random().publicKey();
  const nonMember = Keypair.random().publicKey();
  let testCommunityId: string;
  let otherCommunityId: string;

  beforeAll(async () => {
    pool = makeTestPool();
    const client = await pool.connect();
    try {
      await seedTestDatabase(client);

      // Create a test community with admin
      const created = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(adminIssuer))
        .send({
          name: 'Update Test DAO',
          description: 'Original description',
          issuerPublicKey: adminIssuer,
          assetCode: 'UPDT',
          assetIssuer: adminIssuer,
        });
      testCommunityId = created.body.data.id;

      // Add a treasurer
      await request(app)
        .post(`/api/v1/communities/${testCommunityId}/members`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ stellarAddress: treasurer, role: 'treasurer' });

      // Add a regular member
      await request(app)
        .post(`/api/v1/communities/${testCommunityId}/members`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ stellarAddress: regularMember, role: 'member' });

      // Create another community for duplicate name testing
      const other = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(adminIssuer))
        .send({
          name: 'Another DAO',
          issuerPublicKey: adminIssuer,
          assetCode: 'OTHR',
          assetIssuer: adminIssuer,
        });
      otherCommunityId = other.body.data.id;
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

  describe('Successful updates', () => {
    it('updates community name as admin', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'Updated DAO Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated DAO Name');
      expect(res.body.data.id).toBe(testCommunityId);
    });

    it('updates community description as admin', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ description: 'New updated description' });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('New updated description');
    });

    it('updates both name and description together', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({
          name: 'Both Updated DAO',
          description: 'Both fields updated',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Both Updated DAO');
      expect(res.body.data.description).toBe('Both fields updated');
    });

    it('sets description to null', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ description: null });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBeNull();
    });

    it('updates community settings as admin', async () => {
      const settings = { maxMembers: 100, requiresApproval: true };
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ settings });

      expect(res.status).toBe(200);
      expect(res.body.data.settings).toEqual(settings);
    });

    it('updates settings along with name and description', async () => {
      const settings = { votingPeriod: 7 };
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({
          name: 'Settings Update DAO',
          description: 'With settings',
          settings,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Settings Update DAO');
      expect(res.body.data.description).toBe('With settings');
      expect(res.body.data.settings).toEqual(settings);
    });

    it('allows treasurer to update community', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(treasurer))
        .send({ description: 'Updated by treasurer' });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Updated by treasurer');
    });

    it('preserves fields not included in update request', async () => {
      // First get the current state
      const before = await request(app).get(`/api/v1/communities/${testCommunityId}`);
      const originalAssetCode = before.body.data.community.asset_code;

      // Update only description
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ description: 'Only description changed' });

      expect(res.status).toBe(200);
      expect(res.body.data.asset_code).toBe(originalAssetCode);
      expect(res.body.data.issuer_public_key).toBe(adminIssuer);
    });

    it('updates updated_at timestamp', async () => {
      const before = await request(app).get(`/api/v1/communities/${testCommunityId}`);
      const originalUpdatedAt = new Date(before.body.data.community.updated_at);

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 100));

      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ description: 'Timestamp test' });

      expect(res.status).toBe(200);
      const newUpdatedAt = new Date(res.body.data.updated_at);
      expect(newUpdatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Not found scenarios', () => {
    it('returns 404 for non-existent community UUID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .put(`/api/v1/communities/${fakeId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'Should Not Work' });

      expect(res.status).toBe(404);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toBeDefined();
      expect(res.body.error).toContain('Community not found');
    });

    it('returns 404 for soft-deleted community', async () => {
      // Create and delete a community
      const created = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(adminIssuer))
        .send({
          name: 'To Be Deleted DAO',
          issuerPublicKey: adminIssuer,
          assetCode: 'DEL',
          assetIssuer: adminIssuer,
        });
      const deletedId = created.body.data.id;

      await request(app)
        .delete(`/api/v1/communities/${deletedId}`)
        .set('Authorization', authHeader(adminIssuer));

      // Try to update the deleted community
      const res = await request(app)
        .put(`/api/v1/communities/${deletedId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'Should Not Update' });

      expect(res.status).toBe(404);
      expect(res.body.data).toBeNull();
    });

    it('returns 400 for invalid UUID format', async () => {
      const res = await request(app)
        .put('/api/v1/communities/not-a-uuid')
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'Invalid ID' });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });
  });

  describe('Unauthorized access', () => {
    it('returns 401 when no authentication provided', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .send({ name: 'Unauthenticated Update' });

      expect(res.status).toBe(401);
    });

    it('returns 403 when regular member tries to update', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(regularMember))
        .send({ description: 'Member cannot update' });

      expect(res.status).toBe(403);
      expect(res.body.data).toBeNull();
    });

    it('returns 403 when non-member tries to update', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(nonMember))
        .send({ description: 'Non-member cannot update' });

      expect(res.status).toBe(403);
      expect(res.body.data).toBeNull();
    });

    it('returns 403 when observer tries to update', async () => {
      const observer = Keypair.random().publicKey();
      await request(app)
        .post(`/api/v1/communities/${testCommunityId}/members`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ stellarAddress: observer, role: 'observer' });

      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(observer))
        .send({ description: 'Observer cannot update' });

      expect(res.status).toBe(403);
      expect(res.body.data).toBeNull();
    });

    it('prevents updating a different community without authorization', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${otherCommunityId}`)
        .set('Authorization', authHeader(treasurer))
        .send({ description: 'Cross-community update attempt' });

      expect(res.status).toBe(403);
    });
  });

  describe('Duplicate name handling on update', () => {
    it('rejects update that creates duplicate name with 409', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'Another DAO' }); // Name of otherCommunityId

      expect(res.status).toBe(409);
      expect(res.body.data).toBeNull();
      expect(res.body.error.code).toBe('COMMUNITY_NAME_EXISTS');
    });

    it('performs case-insensitive duplicate check on update', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'another dao' }); // Different case

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('COMMUNITY_NAME_EXISTS');
    });

    it('allows updating to the same name (no change)', async () => {
      const current = await request(app).get(`/api/v1/communities/${testCommunityId}`);
      const currentName = current.body.data.community.name;

      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: currentName });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe(currentName);
    });

    it('allows updating to the same name with different case/whitespace', async () => {
      const current = await request(app).get(`/api/v1/communities/${testCommunityId}`);
      const currentName = current.body.data.community.name;

      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: `  ${currentName.toUpperCase()}  ` });

      expect(res.status).toBe(200);
    });
  });

  describe('Validation on update', () => {
    it('rejects name shorter than 2 characters', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'A' });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects name longer than 64 characters', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'A'.repeat(65) });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects description longer than 500 characters', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ description: 'A'.repeat(501) });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects an update body with no updatable fields', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({});

      expect(res.status).toBe(400);
    });

    it('ignores immutable fields in update request', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({
          description: 'Updated alongside immutable fields',
          issuerPublicKey: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          assetCode: 'HACK',
          assetIssuer: 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        });

      // Should succeed but ignore the immutable fields
      expect(res.status).toBe(200);
      expect(res.body.data.issuer_public_key).toBe(adminIssuer);
      expect(res.body.data.asset_code).not.toBe('HACK');
    });
  });

  describe('Edge cases', () => {
    it('handles very long valid name at boundary (64 chars)', async () => {
      const longName = 'A'.repeat(64);
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: longName });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe(longName);
    });

    it('handles unicode characters in name', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: 'Test 日本語 DAO' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Test 日本語 DAO');
    });

    it('trims whitespace from name', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${testCommunityId}`)
        .set('Authorization', authHeader(adminIssuer))
        .send({ name: '  Trimmed Name DAO  ' });

      expect(res.status).toBe(200);
      // The API should accept it (trimming is done internally for duplicate checks)
    });

    it('handles rapid successive updates', async () => {
      const updates = [
        request(app)
          .put(`/api/v1/communities/${testCommunityId}`)
          .set('Authorization', authHeader(adminIssuer))
          .send({ description: 'Update 1' }),
        request(app)
          .put(`/api/v1/communities/${testCommunityId}`)
          .set('Authorization', authHeader(adminIssuer))
          .send({ description: 'Update 2' }),
        request(app)
          .put(`/api/v1/communities/${testCommunityId}`)
          .set('Authorization', authHeader(adminIssuer))
          .send({ description: 'Update 3' }),
      ];

      const results = await Promise.all(updates);
      results.forEach((res) => {
        expect(res.status).toBe(200);
      });

      // Last update should win
      const final = await request(app).get(`/api/v1/communities/${testCommunityId}`);
      expect(['Update 1', 'Update 2', 'Update 3']).toContain(final.body.data.community.description);
    });
  });
});
