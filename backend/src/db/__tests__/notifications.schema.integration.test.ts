/**
 * Integration test: verifies the notifications table's constraints against a
 * real PostgreSQL database. Requires DATABASE_URL pointing at a migrated
 * database; skipped automatically when DATABASE_URL is not set.
 */

import { Pool, PoolClient } from 'pg';
import { createCommunity, makeTestPool, truncateAll } from '../../test/fixtures';

const RUN = Boolean(process.env.DATABASE_URL);
const describeIf = RUN ? describe : describe.skip;

const VALID_ADDRESS = 'G' + 'F'.repeat(55);

interface NotificationOverrides {
  stellarAddress: string;
  communityId: string | null;
  type: string;
  title: string;
  createdAt: string | null;
  readAt: string | null;
}

describeIf('notifications schema (integration)', () => {
  let pool: Pool;
  let client: PoolClient;

  const insertNotification = (overrides: Partial<NotificationOverrides> = {}): Promise<unknown> =>
    client.query(
      `INSERT INTO notifications
         (stellar_address, community_id, type, title, created_at, read_at)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6)`,
      [
        overrides.stellarAddress ?? VALID_ADDRESS,
        overrides.communityId ?? null,
        overrides.type ?? 'member_added',
        overrides.title ?? 'Welcome',
        overrides.createdAt ?? null,
        overrides.readAt ?? null,
      ]
    );

  beforeAll(async () => {
    pool = makeTestPool();
    client = await pool.connect();
    await truncateAll(client);
  });

  afterAll(async () => {
    await truncateAll(client);
    client.release();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(client);
  });

  it('accepts a well-formed notification', async () => {
    const community = await createCommunity(client, { name: 'NotifyDAO' });
    await insertNotification({ communityId: community.id });

    const { rows } = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM notifications'
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('allows a null community for system-wide notifications', async () => {
    await insertNotification({ communityId: null });

    const { rows } = await client.query('SELECT community_id FROM notifications');
    expect(rows[0].community_id).toBeNull();
  });

  it('rejects a malformed Stellar address', async () => {
    await expect(insertNotification({ stellarAddress: 'not-a-stellar-address' })).rejects.toThrow(
      /notifications_stellar_address_format/
    );
  });

  it('rejects a read_at earlier than created_at', async () => {
    await expect(
      insertNotification({
        createdAt: '2026-01-02T00:00:00Z',
        readAt: '2026-01-01T00:00:00Z',
      })
    ).rejects.toThrow(/notifications_read_at_check/);
  });

  it('accepts a read_at at or after created_at', async () => {
    await insertNotification({
      createdAt: '2026-01-01T00:00:00Z',
      readAt: '2026-01-01T00:00:00Z',
    });
    await insertNotification({
      createdAt: '2026-01-01T00:00:00Z',
      readAt: '2026-01-02T00:00:00Z',
    });

    const { rows } = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM notifications'
    );
    expect(Number(rows[0].count)).toBe(2);
  });

  it('rejects a blank title', async () => {
    await expect(insertNotification({ title: '   ' })).rejects.toThrow(/notifications_title_check/);
  });

  it('rejects an unknown notification type', async () => {
    await expect(insertNotification({ type: 'loan_abducted' })).rejects.toThrow(
      /notifications_type_check/
    );
  });

  it('cascades notification deletion when the owning community is deleted', async () => {
    const community = await createCommunity(client, { name: 'CascadeNotifyDAO' });
    await insertNotification({ communityId: community.id });

    await client.query('DELETE FROM communities WHERE id = $1', [community.id]);

    const { rows } = await client.query('SELECT 1 FROM notifications');
    expect(rows).toHaveLength(0);
  });
});
