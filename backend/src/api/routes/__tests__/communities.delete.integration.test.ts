/**
 * Integration test: DELETE /api/v1/communities/:id (soft delete, cascade check)
 * Issue #375 - Verifies soft-deletion behavior and cascade effects on related data
 * Runs against a real PostgreSQL instance.
 */

import request from 'supertest';
import { Pool, PoolClient } from 'pg';
import app from '../../../app';
import { makeTestPool, createCommunity, createMember, TEST_ISSUER_1, TEST_MEMBERS } from '../../../testing/fixtures';
import { createSessionToken } from '../../utils/sessionToken';

const RUN = Boolean(process.env.DATABASE_URL);
const describeIf = RUN ? describe : describe.skip;

describeIf('DELETE /api/v1/communities/:id integration', () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    pool = makeTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  it('soft-deletes a community by setting deleted_at', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_ISSUER_1, 'admin');

    const { token } = createSessionToken(TEST_ISSUER_1);

    const response = await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: community.id,
      deleted: true,
    });

    // Verify soft-delete: deleted_at should be set
    const result = await client.query(
      'SELECT deleted_at FROM communities WHERE id = $1',
      [community.id]
    );
    expect(result.rows[0].deleted_at).not.toBeNull();
  });

  it('returns 404 when community does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const { token } = createSessionToken(TEST_ISSUER_1);

    const response = await request(app)
      .delete(`/api/v1/communities/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Community not found');
  });

  it('returns 404 when community is already soft-deleted', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_ISSUER_1, 'admin');

    // Soft-delete the community
    await client.query(
      'UPDATE communities SET deleted_at = NOW() WHERE id = $1',
      [community.id]
    );

    const { token } = createSessionToken(TEST_ISSUER_1);

    const response = await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Community not found');
  });

  it('returns 400 when id is not a valid UUID', async () => {
    const { token } = createSessionToken(TEST_ISSUER_1);

    const response = await request(app)
      .delete('/api/v1/communities/not-a-uuid')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.meta.errors).toEqual([
      { path: 'id', message: 'id must be a valid UUID' },
    ]);
  });

  it('requires authentication', async () => {
    const community = await createCommunity(client);

    const response = await request(app)
      .delete(`/api/v1/communities/${community.id}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication required');
  });

  it('requires admin role', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_MEMBERS[0], 'member');

    const { token } = createSessionToken(TEST_MEMBERS[0]);

    const response = await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Requires community role');
  });

  it('allows deletion by admin role', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_MEMBERS[0], 'admin');

    const { token } = createSessionToken(TEST_MEMBERS[0]);

    const response = await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.deleted).toBe(true);
  });

  it('does not cascade delete to members table (soft-delete only)', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_ISSUER_1, 'admin');
    await createMember(client, community.id, TEST_MEMBERS[0], 'member');
    await createMember(client, community.id, TEST_MEMBERS[1], 'treasurer');

    const { token } = createSessionToken(TEST_ISSUER_1);

    await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Members should still exist (not cascaded)
    const members = await client.query(
      'SELECT COUNT(*)::int as count FROM members WHERE community_id = $1 AND deleted_at IS NULL',
      [community.id]
    );
    expect(members.rows[0].count).toBe(3);
  });

  it('does not cascade delete to tokens table', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_ISSUER_1, 'admin');

    // Create a token for the community
    await client.query(
      `INSERT INTO tokens (community_id, asset_code, asset_issuer, total_supply)
       VALUES ($1, $2, $3, $4)`,
      [community.id, 'TOKEN', TEST_ISSUER_1, '1000000']
    );

    const { token } = createSessionToken(TEST_ISSUER_1);

    await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Token should still exist
    const tokens = await client.query(
      'SELECT COUNT(*)::int as count FROM tokens WHERE community_id = $1',
      [community.id]
    );
    expect(tokens.rows[0].count).toBe(1);
  });

  it('does not cascade delete to transactions_log table', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_ISSUER_1, 'admin');

    // Create transaction log entries
    await client.query(
      `INSERT INTO transactions_log (community_id, actor_address, action, metadata)
       VALUES ($1, $2, $3, $4)`,
      [community.id, TEST_ISSUER_1, 'community_created', '{}']
    );

    const { token } = createSessionToken(TEST_ISSUER_1);

    await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Transaction logs should still exist
    const logs = await client.query(
      'SELECT COUNT(*)::int as count FROM transactions_log WHERE community_id = $1',
      [community.id]
    );
    expect(logs.rows[0].count).toBe(1);
  });

  it('does not cascade delete to community_settings table', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_ISSUER_1, 'admin');

    // Create community settings
    await client.query(
      `INSERT INTO community_settings (community_id, settings)
       VALUES ($1, $2)`,
      [community.id, '{"theme": "dark"}']
    );

    const { token } = createSessionToken(TEST_ISSUER_1);

    await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Settings should still exist
    const settings = await client.query(
      'SELECT COUNT(*)::int as count FROM community_settings WHERE community_id = $1',
      [community.id]
    );
    expect(settings.rows[0].count).toBe(1);
  });

  it('hides soft-deleted community from GET /api/v1/communities/:id', async () => {
    const community = await createCommunity(client);
    await createMember(client, community.id, TEST_ISSUER_1, 'admin');

    const { token } = createSessionToken(TEST_ISSUER_1);

    // Delete the community
    await request(app)
      .delete(`/api/v1/communities/${community.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Attempt to retrieve the deleted community
    const response = await request(app)
      .get(`/api/v1/communities/${community.id}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Community not found');
  });

  it('hides soft-deleted community from GET /api/v1/communities list', async () => {
    const community1 = await createCommunity(client, { name: 'Active Community' });
    const community2 = await createCommunity(client, { name: 'Deleted Community' });
    await createMember(client, community2.id, TEST_ISSUER_1, 'admin');

    const { token } = createSessionToken(TEST_ISSUER_1);

    // Delete community2
    await request(app)
      .delete(`/api/v1/communities/${community2.id}`)
      .set('Authorization', `Bearer ${token}`);

    // List communities
    const response = await request(app)
      .get('/api/v1/communities');

    expect(response.status).toBe(200);
    const communityIds = response.body.data.map((c: { id: string }) => c.id);
    expect(communityIds).toContain(community1.id);
    expect(communityIds).not.toContain(community2.id);
  });
});
