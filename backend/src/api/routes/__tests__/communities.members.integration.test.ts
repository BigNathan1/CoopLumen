/**
 * Integration tests for member management endpoints
 * Tests GET, POST, PUT, DELETE operations on /api/v1/communities/:id/members
 * Issue #376 [#298]
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

describeIf('Member management endpoints (integration)', () => {
  let pool: Pool;
  const admin = Keypair.random().publicKey();
  const treasurer = Keypair.random().publicKey();
  const member1 = Keypair.random().publicKey();
  const member2 = Keypair.random().publicKey();
  const observer = Keypair.random().publicKey();
  const nonMember = Keypair.random().publicKey();
  let communityId: string;

  beforeAll(async () => {
    pool = makeTestPool();
    const client = await pool.connect();
    try {
      await seedTestDatabase(client);

      // Create a test community
      const created = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(admin))
        .send({
          name: 'Member Test DAO',
          description: 'For testing member management',
          issuerPublicKey: admin,
          assetCode: 'MEMB',
          assetIssuer: admin,
        });
      communityId = created.body.data.id;
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

  describe('POST /api/v1/communities/:id/members - Add member', () => {
    it('adds a new member with default role (member)', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: member1 });

      expect(res.status).toBe(201);
      expect(res.body.data.stellar_address).toBe(member1);
      expect(res.body.data.role).toBe('member');
      expect(res.body.data).toHaveProperty('joined_at');
    });

    it('adds a member with specified role (treasurer)', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: treasurer, role: 'treasurer' });

      expect(res.status).toBe(201);
      expect(res.body.data.stellar_address).toBe(treasurer);
      expect(res.body.data.role).toBe('treasurer');
    });

    it('adds a member with admin role', async () => {
      const newAdmin = Keypair.random().publicKey();
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: newAdmin, role: 'admin' });

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('admin');
    });

    it('adds a member with observer role', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: observer, role: 'observer' });

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('observer');
    });

    it('reactivates a previously removed member', async () => {
      const removable = Keypair.random().publicKey();

      // Add member
      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: removable, role: 'member' });

      // Remove member
      await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${removable}`)
        .set('Authorization', authHeader(removable));

      // Re-add member
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: removable, role: 'treasurer' });

      expect(res.status).toBe(201);
      expect(res.body.data.stellar_address).toBe(removable);
      expect(res.body.data.role).toBe('treasurer');
    });

    it('requires authentication to add member', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .send({ stellarAddress: Keypair.random().publicKey() });

      expect(res.status).toBe(401);
    });

    it('requires admin role to add member', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(member1))
        .send({ stellarAddress: Keypair.random().publicKey() });

      expect(res.status).toBe(403);
    });

    it('rejects invalid Stellar address', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: 'INVALID_ADDRESS' });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('rejects invalid role', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: Keypair.random().publicKey(), role: 'invalid_role' });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('returns 404 for non-existent community', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post(`/api/v1/communities/${fakeId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: Keypair.random().publicKey() });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Community not found');
    });
  });

  describe('GET /api/v1/communities/:id/members - List members', () => {
    it('lists all members with pagination', async () => {
      const res = await request(app).get(`/api/v1/communities/${communityId}/members`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('page');
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta.total).toBeGreaterThanOrEqual(4); // admin + members added
    });

    it('filters members by role', async () => {
      const res = await request(app).get(
        `/api/v1/communities/${communityId}/members?role=treasurer`
      );

      expect(res.status).toBe(200);
      expect(res.body.data.every((m: { role: string }) => m.role === 'treasurer')).toBe(true);
      expect(
        res.body.data.some((m: { stellar_address: string }) => m.stellar_address === treasurer)
      ).toBe(true);
    });

    it('filters members by admin role', async () => {
      const res = await request(app).get(`/api/v1/communities/${communityId}/members?role=admin`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((m: { role: string }) => m.role === 'admin')).toBe(true);
      expect(
        res.body.data.some((m: { stellar_address: string }) => m.stellar_address === admin)
      ).toBe(true);
    });

    it('respects pagination limit', async () => {
      const res = await request(app).get(`/api/v1/communities/${communityId}/members?limit=2`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.limit).toBe(2);
    });

    it('supports pagination with page parameter', async () => {
      const page1 = await request(app).get(
        `/api/v1/communities/${communityId}/members?limit=2&page=1`
      );
      const page2 = await request(app).get(
        `/api/v1/communities/${communityId}/members?limit=2&page=2`
      );

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page1.body.meta.page).toBe(1);
      expect(page2.body.meta.page).toBe(2);

      if (page1.body.data.length > 0 && page2.body.data.length > 0) {
        expect(page1.body.data[0].stellar_address).not.toBe(page2.body.data[0].stellar_address);
      }
    });

    it('returns 400 for invalid role filter', async () => {
      const res = await request(app).get(
        `/api/v1/communities/${communityId}/members?role=invalid_role`
      );

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('excludes soft-deleted members from list', async () => {
      const removable = Keypair.random().publicKey();

      // Add and then remove a member
      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: removable });

      await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${removable}`)
        .set('Authorization', authHeader(removable));

      // List should not include removed member
      const res = await request(app).get(`/api/v1/communities/${communityId}/members?limit=100`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.some((m: { stellar_address: string }) => m.stellar_address === removable)
      ).toBe(false);
    });
  });

  describe('GET /api/v1/communities/:id/members/:address - Get single member', () => {
    it('fetches a single member by address', async () => {
      const res = await request(app).get(`/api/v1/communities/${communityId}/members/${member1}`);

      expect(res.status).toBe(200);
      expect(res.body.data.stellar_address).toBe(member1);
      expect(res.body.data.role).toBe('member');
      expect(res.body.data).toHaveProperty('joined_at');
    });

    it('fetches admin member details', async () => {
      const res = await request(app).get(`/api/v1/communities/${communityId}/members/${admin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.stellar_address).toBe(admin);
      expect(res.body.data.role).toBe('admin');
    });

    it('returns 404 for member not in community', async () => {
      const res = await request(app).get(`/api/v1/communities/${communityId}/members/${nonMember}`);

      expect(res.status).toBe(404);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toContain('Member not found');
    });

    it('returns 400 for invalid Stellar address format', async () => {
      const res = await request(app).get(
        `/api/v1/communities/${communityId}/members/not-a-valid-address`
      );

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toContain('Invalid Stellar address');
    });

    it('returns 404 for soft-deleted member', async () => {
      const removable = Keypair.random().publicKey();

      // Add and remove member
      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: removable });

      await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${removable}`)
        .set('Authorization', authHeader(removable));

      // Should not be found
      const res = await request(app).get(`/api/v1/communities/${communityId}/members/${removable}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/communities/:id/members/:address - Update member role', () => {
    it('updates member role from member to treasurer', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${member1}`)
        .set('Authorization', authHeader(admin))
        .send({ role: 'treasurer' });

      expect(res.status).toBe(200);
      expect(res.body.data.stellar_address).toBe(member1);
      expect(res.body.data.role).toBe('treasurer');
    });

    it('updates member role to admin', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${member1}`)
        .set('Authorization', authHeader(admin))
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('admin');
    });

    it('updates member role to observer', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${member1}`)
        .set('Authorization', authHeader(admin))
        .send({ role: 'observer' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('observer');
    });

    it('updates member role back to member', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${member1}`)
        .set('Authorization', authHeader(admin))
        .send({ role: 'member' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('member');
    });

    it('requires authentication to update role', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${member1}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(401);
    });

    it('requires admin role to update member', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${member1}`)
        .set('Authorization', authHeader(member1))
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
    });

    it('returns 404 when updating non-existent member', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${nonMember}`)
        .set('Authorization', authHeader(admin))
        .send({ role: 'admin' });

      expect(res.status).toBe(404);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toContain('Member not found');
    });

    it('returns 400 for invalid Stellar address', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/invalid-address`)
        .set('Authorization', authHeader(admin))
        .send({ role: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid Stellar address');
    });

    it('returns 400 for invalid role value', async () => {
      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${member1}`)
        .set('Authorization', authHeader(admin))
        .send({ role: 'super_admin' });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('returns 404 for soft-deleted member', async () => {
      const removable = Keypair.random().publicKey();

      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: removable });

      await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${removable}`)
        .set('Authorization', authHeader(removable));

      const res = await request(app)
        .put(`/api/v1/communities/${communityId}/members/${removable}`)
        .set('Authorization', authHeader(admin))
        .send({ role: 'admin' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/communities/:id/members/:address - Remove member', () => {
    beforeEach(async () => {
      // Add member2 for removal tests
      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: member2, role: 'member' });
    });

    it('allows member to remove themselves', async () => {
      const res = await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${member2}`)
        .set('Authorization', authHeader(member2));

      expect(res.status).toBe(200);
      expect(res.body.data.stellar_address).toBe(member2);
      expect(res.body.data.removed).toBe(true);
    });

    it('allows admin to remove another member', async () => {
      // Re-add member2
      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: member2 });

      const res = await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${member2}`)
        .set('Authorization', authHeader(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe(true);
    });

    it('hides removed member from subsequent lookups', async () => {
      const testMember = Keypair.random().publicKey();

      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: testMember });

      await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${testMember}`)
        .set('Authorization', authHeader(testMember));

      const res = await request(app).get(
        `/api/v1/communities/${communityId}/members/${testMember}`
      );

      expect(res.status).toBe(404);
    });

    it('requires authentication to remove member', async () => {
      const res = await request(app).delete(
        `/api/v1/communities/${communityId}/members/${member1}`
      );

      expect(res.status).toBe(401);
    });

    it('prevents non-admin from removing other members', async () => {
      const testMember = Keypair.random().publicKey();

      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: testMember });

      const res = await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${testMember}`)
        .set('Authorization', authHeader(member1));

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only an admin can remove another member');
    });

    it('returns 404 for non-existent member', async () => {
      const res = await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${nonMember}`)
        .set('Authorization', authHeader(admin));

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Member not found');
    });

    it('returns 400 for invalid Stellar address', async () => {
      const res = await request(app)
        .delete(`/api/v1/communities/${communityId}/members/invalid-address`)
        .set('Authorization', authHeader(admin));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid Stellar address');
    });

    it('returns 404 when trying to remove already removed member', async () => {
      const testMember = Keypair.random().publicKey();

      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: testMember });

      await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${testMember}`)
        .set('Authorization', authHeader(testMember));

      // Try removing again
      const res = await request(app)
        .delete(`/api/v1/communities/${communityId}/members/${testMember}`)
        .set('Authorization', authHeader(admin));

      expect(res.status).toBe(404);
    });
  });

  describe('Edge cases and error handling', () => {
    it('handles concurrent member additions gracefully', async () => {
      const newMembers = [
        Keypair.random().publicKey(),
        Keypair.random().publicKey(),
        Keypair.random().publicKey(),
      ];

      const promises = newMembers.map((addr) =>
        request(app)
          .post(`/api/v1/communities/${communityId}/members`)
          .set('Authorization', authHeader(admin))
          .send({ stellarAddress: addr })
      );

      const results = await Promise.all(promises);
      results.forEach((res) => {
        expect(res.status).toBe(201);
      });
    });

    it('maintains referential integrity with community', async () => {
      // Create and delete a community
      const tempCommunity = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', authHeader(admin))
        .send({
          name: 'Temp Community',
          issuerPublicKey: admin,
          assetCode: 'TEMP',
          assetIssuer: admin,
        });
      const tempId = tempCommunity.body.data.id;

      await request(app)
        .delete(`/api/v1/communities/${tempId}`)
        .set('Authorization', authHeader(admin));

      // Try to add member to deleted community
      const res = await request(app)
        .post(`/api/v1/communities/${tempId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: Keypair.random().publicKey() });

      expect(res.status).toBe(404);
    });

    it('handles role transitions through all roles', async () => {
      const testMember = Keypair.random().publicKey();

      await request(app)
        .post(`/api/v1/communities/${communityId}/members`)
        .set('Authorization', authHeader(admin))
        .send({ stellarAddress: testMember, role: 'observer' });

      const roles = ['member', 'treasurer', 'admin', 'observer'];
      for (const role of roles) {
        const res = await request(app)
          .put(`/api/v1/communities/${communityId}/members/${testMember}`)
          .set('Authorization', authHeader(admin))
          .send({ role });

        expect(res.status).toBe(200);
        expect(res.body.data.role).toBe(role);
      }
    });
  });
});
