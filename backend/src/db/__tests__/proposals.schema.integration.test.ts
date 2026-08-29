/**
 * Integration test: verifies the proposals table's constraints against a real
 * PostgreSQL database. Requires DATABASE_URL pointing at a migrated database;
 * skipped automatically when DATABASE_URL is not set.
 */

import { Pool, PoolClient } from 'pg';
import { createCommunity, makeTestPool, truncateAll } from '../../test/fixtures';

const RUN = Boolean(process.env.DATABASE_URL);
const describeIf = RUN ? describe : describe.skip;

const VALID_ADDRESS = 'G' + 'H'.repeat(55);

interface ProposalOverrides {
  communityId: string;
  proposerAddress: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  quorumPercent: number;
  votingStartsAt: string | null;
  votingEndsAt: string;
  executedAt: string | null;
}

describeIf('proposals schema (integration)', () => {
  let pool: Pool;
  let client: PoolClient;
  let communityId: string;

  const insertProposal = (overrides: Partial<ProposalOverrides> = {}): Promise<unknown> =>
    client.query(
      `INSERT INTO proposals
         (community_id, proposer_address, title, description, type, status,
          quorum_percent, voting_starts_at, voting_ends_at, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9, $10)`,
      [
        overrides.communityId ?? communityId,
        overrides.proposerAddress ?? VALID_ADDRESS,
        overrides.title ?? 'Fund the community garden',
        overrides.description ?? null,
        overrides.type ?? 'general',
        overrides.status ?? 'draft',
        overrides.quorumPercent ?? 50,
        overrides.votingStartsAt ?? null,
        overrides.votingEndsAt ?? '2030-01-01T00:00:00Z',
        overrides.executedAt ?? null,
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
    const community = await createCommunity(client, { name: 'GovernanceDAO' });
    communityId = community.id;
  });

  it('accepts a well-formed proposal', async () => {
    await insertProposal();

    const { rows } = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM proposals'
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('rejects a malformed proposer address', async () => {
    await expect(insertProposal({ proposerAddress: 'not-a-stellar-address' })).rejects.toThrow(
      /proposals_proposer_address_format/
    );
  });

  it('rejects a blank title', async () => {
    await expect(insertProposal({ title: '   ' })).rejects.toThrow(/proposals_title_check/);
  });

  it('rejects an over-long title', async () => {
    await expect(insertProposal({ title: 'x'.repeat(201) })).rejects.toThrow(
      /proposals_title_length/
    );
  });

  it('rejects an over-long description', async () => {
    await expect(insertProposal({ description: 'x'.repeat(10001) })).rejects.toThrow(
      /proposals_description_length/
    );
  });

  it('rejects an unknown proposal type', async () => {
    await expect(insertProposal({ type: 'hostile_takeover' })).rejects.toThrow(
      /proposals_type_check/
    );
  });

  it('rejects an unknown status', async () => {
    await expect(insertProposal({ status: 'vibing' })).rejects.toThrow(/proposals_status_check/);
  });

  it('rejects a quorum outside 0-100', async () => {
    await expect(insertProposal({ quorumPercent: 101 })).rejects.toThrow(
      /proposals_quorum_percent_check/
    );
  });

  it('rejects a voting window that closes before it opens', async () => {
    await expect(
      insertProposal({
        votingStartsAt: '2030-01-02T00:00:00Z',
        votingEndsAt: '2030-01-01T00:00:00Z',
      })
    ).rejects.toThrow(/proposals_voting_window_check/);
  });

  it('rejects an execution timestamp before voting opened', async () => {
    await expect(
      insertProposal({
        status: 'executed',
        votingStartsAt: '2030-01-02T00:00:00Z',
        votingEndsAt: '2030-01-03T00:00:00Z',
        executedAt: '2030-01-01T00:00:00Z',
      })
    ).rejects.toThrow(/proposals_executed_at_check/);
  });

  it('rejects an execution timestamp on an unsettled proposal', async () => {
    await expect(
      insertProposal({ status: 'active', executedAt: '2030-02-01T00:00:00Z' })
    ).rejects.toThrow(/proposals_executed_at_check/);
  });

  it('accepts an execution timestamp on a settled proposal', async () => {
    await insertProposal({
      status: 'executed',
      votingStartsAt: '2030-01-01T00:00:00Z',
      votingEndsAt: '2030-01-02T00:00:00Z',
      executedAt: '2030-01-03T00:00:00Z',
    });

    const { rows } = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM proposals'
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('rejects a duplicate execution transaction hash', async () => {
    await client.query(
      `INSERT INTO proposals
         (community_id, proposer_address, title, voting_ends_at, stellar_tx_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [communityId, VALID_ADDRESS, 'First', '2030-01-01T00:00:00Z', 'a'.repeat(64)]
    );

    await expect(
      client.query(
        `INSERT INTO proposals
           (community_id, proposer_address, title, voting_ends_at, stellar_tx_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [communityId, VALID_ADDRESS, 'Second', '2030-01-01T00:00:00Z', 'a'.repeat(64)]
      )
    ).rejects.toThrow(/proposals_stellar_tx_hash_key/);
  });

  it('maintains updated_at on write', async () => {
    await insertProposal();
    const before = await client.query<{ updated_at: Date }>('SELECT updated_at FROM proposals');

    await client.query(`UPDATE proposals SET status = 'active'`);
    const after = await client.query<{ updated_at: Date }>('SELECT updated_at FROM proposals');

    expect(after.rows[0].updated_at.getTime()).toBeGreaterThanOrEqual(
      before.rows[0].updated_at.getTime()
    );
  });

  it('cascades proposal deletion when the owning community is deleted', async () => {
    await insertProposal();

    await client.query('DELETE FROM communities WHERE id = $1', [communityId]);

    const { rows } = await client.query('SELECT 1 FROM proposals');
    expect(rows).toHaveLength(0);
  });
});
