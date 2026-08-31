/**
 * Integration test: exercises the full community CRUD lifecycle over HTTP
 * against a real PostgreSQL database. Requires DATABASE_URL pointing at a
 * migrated database; skipped automatically when DATABASE_URL is not set.
 */

import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { Pool } from 'pg';
import app from '../../../app';
import { db } from '../../../db';
import { makeTestPool, seedTestDatabase, truncateAll } from '../../../test/fixtures';
import { createSessionToken } from '../../utils/sessionToken';

const RUN = Boolean(process.env.DATABASE_URL);
const describeIf = RUN ? describe : describe.skip;

function authHeader(address: string): string {
  return `Bearer ${createSessionToken(address).token}`;
}

describeIf('Community CRUD (integration)', () => {
  let pool: Pool;
  const issuer = Keypair.random().publicKey();
  const member = Keypair.random().publicKey();
  const nonMember = Keypair.random().publicKey();

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

  let communityId: string;

  it('creates a community', async () => {
    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(issuer))
      .send({
        name: 'IntegrationDAO',
        description: 'Created by integration test',
        issuerPublicKey: issuer,
        assetCode: 'INTG',
        assetIssuer: issuer,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    communityId = res.body.data.id;
  });

  it('rejects a duplicate community name with 409', async () => {
    const res = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(issuer))
      .send({
        name: 'IntegrationDAO',
        issuerPublicKey: issuer,
        assetCode: 'INTG',
        assetIssuer: issuer,
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COMMUNITY_NAME_EXISTS');
  });

  it('lists the community with pagination meta', async () => {
    const res = await request(app).get('/api/v1/communities?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    expect(res.body.data.some((c: { id: string }) => c.id === communityId)).toBe(true);
  });

  it('fetches and enriches a single community', async () => {
    const res = await request(app).get(`/api/v1/communities/${communityId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.community.name).toBe('IntegrationDAO');
    expect(res.body.data.community.member_count).toBe(0);
    expect(res.body.data.statistics).toEqual({
      totalTransactions: 1,
      totalTokenSupply: 0,
    });
  });

  it('finds the community via the general list search parameter', async () => {
    const res = await request(app).get('/api/v1/communities?search=IntegrationDAO');
    expect(res.status).toBe(200);
    expect(res.body.data.some((c: { id: string }) => c.id === communityId)).toBe(true);
  });

  it('updates the community', async () => {
    const res = await request(app)
      .put(`/api/v1/communities/${communityId}`)
      .set('Authorization', authHeader(issuer))
      .send({ description: 'Updated description' });
    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('Updated description');
  });

  it('sets the community avatar', async () => {
    const res = await request(app)
      .post(`/api/v1/communities/${communityId}/avatar`)
      .set('Authorization', authHeader(issuer))
      .send({ avatarUrl: 'https://cdn.example.com/intg.png' });
    expect(res.status).toBe(200);
    expect(res.body.data.avatar_url).toBe('https://cdn.example.com/intg.png');
  });

  it('rejects a duplicate name on update with 409', async () => {
    const other = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', authHeader(issuer))
      .send({
        name: 'AnotherDAO',
        issuerPublicKey: issuer,
        assetCode: 'ANTH',
        assetIssuer: issuer,
      });
    expect(other.status).toBe(201);

    const res = await request(app)
      .put(`/api/v1/communities/${other.body.data.id}`)
      .set('Authorization', authHeader(issuer))
      .send({ name: 'IntegrationDAO' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COMMUNITY_NAME_EXISTS');
  });

  it('records a community_created transactions_log row for the created community', async () => {
    const rows = await db.query<{ action: string; community_id: string; actor_address: string }>(
      `SELECT action, community_id, actor_address FROM transactions_log WHERE community_id = $1`,
      [communityId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('community_created');
    expect(rows[0].actor_address).toBe(issuer);
  });

  it('rejects the avatar endpoint on a non-existent community with 403 (no membership row exists)', async () => {
    const res = await request(app)
      .post('/api/v1/communities/00000000-0000-0000-0000-000000000000/avatar')
      .set('Authorization', authHeader(issuer))
      .send({ avatarUrl: 'https://cdn.example.com/missing.png' });
    expect(res.status).toBe(403);
  });

  it('adds and lists a member', async () => {
    const add = await request(app)
      .post(`/api/v1/communities/${communityId}/members`)
      .set('Authorization', authHeader(issuer))
      .send({ stellarAddress: member, role: 'treasurer' });
    expect(add.status).toBe(201);
    expect(add.body.data.stellar_address).toBe(member);
    expect(add.body.data.role).toBe('treasurer');

    const list = await request(app).get(`/api/v1/communities/${communityId}/members`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].stellar_address).toBe(member);
  });

  it('fetches a single member by address', async () => {
    const res = await request(app).get(`/api/v1/communities/${communityId}/members/${member}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stellar_address).toBe(member);
    expect(res.body.data.role).toBe('treasurer');
  });

  it('rejects a structurally invalid Stellar address in the member path', async () => {
    const res = await request(app).get(`/api/v1/communities/${communityId}/members/not-a-key`);
    expect(res.status).toBe(400);
  });

  it('updates a member role', async () => {
    const res = await request(app)
      .put(`/api/v1/communities/${communityId}/members/${member}`)
      .set('Authorization', authHeader(issuer))
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('returns 404 when updating a member that does not exist', async () => {
    const res = await request(app)
      .put(`/api/v1/communities/${communityId}/members/${nonMember}`)
      .set('Authorization', authHeader(issuer))
      .send({ role: 'admin' });
    expect(res.status).toBe(404);
  });

  it('removes a member and hides it from subsequent lookups', async () => {
    const del = await request(app)
      .delete(`/api/v1/communities/${communityId}/members/${member}`)
      .set('Authorization', authHeader(member));
    expect(del.status).toBe(200);
    expect(del.body.data.removed).toBe(true);

    const after = await request(app).get(`/api/v1/communities/${communityId}/members/${member}`);
    expect(after.status).toBe(404);
  });

  it('soft-deletes the community and hides it from reads', async () => {
    const del = await request(app)
      .delete(`/api/v1/communities/${communityId}`)
      .set('Authorization', authHeader(issuer));
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    const after = await request(app).get(`/api/v1/communities/${communityId}`);
    expect(after.status).toBe(404);
  });
});
