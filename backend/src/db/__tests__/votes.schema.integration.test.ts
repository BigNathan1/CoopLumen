/**
 * Integration test: verifies the votes table's constraints against a real
 * PostgreSQL database. Requires DATABASE_URL pointing at a migrated database;
 * skipped automatically when DATABASE_URL is not set.
 */

import { Pool, PoolClient } from 'pg';
import { createCommunity, makeTestPool, truncateAll } from '../../test/fixtures';

const RUN = Boolean(process.env.DATABASE_URL);
const describeIf = RUN ? describe : describe.skip;

const VALID_ADDRESS = 'G' + 'H'.repeat(55);
const OTHER_ADDRESS = 'G' + 'I'.repeat(55);

interface VoteOverrides {
  proposalId: string;
  voterAddress: string;
  choice: string;
  weight: string | number;
  reason: string | null;
  stellarTxHash: string | null;
}

describeIf('votes schema (integration)', () => {
  let pool: Pool;
  let client: PoolClient;
  let proposalId: string;

  const insertVote = (overrides: Partial<VoteOverrides> = {}): Promise<unknown> =>
    client.query(
      `INSERT INTO votes (proposal_id, voter_address, choice, weight, reason, stellar_tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        overrides.proposalId ?? proposalId,
        overrides.voterAddress ?? VALID_ADDRESS,
        overrides.choice ?? 'for',
        overrides.weight ?? 1,
        overrides.reason ?? null,
        overrides.stellarTxHash ?? null,
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
    const community = await createCommunity(client, { name: 'BallotDAO' });
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO proposals (community_id, proposer_address, title, voting_ends_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [community.id, VALID_ADDRESS, 'Fund the community garden', '2030-01-01T00:00:00Z']
    );
    proposalId = rows[0].id;
  });

  it('accepts a well-formed ballot', async () => {
    await insertVote();

    const { rows } = await client.query<{ count: string }>('SELECT COUNT(*) AS count FROM votes');
    expect(Number(rows[0].count)).toBe(1);
  });

  it('defaults weight to 1', async () => {
    await client.query(
      `INSERT INTO votes (proposal_id, voter_address, choice) VALUES ($1, $2, $3)`,
      [proposalId, VALID_ADDRESS, 'abstain']
    );

    const { rows } = await client.query<{ weight: string }>('SELECT weight FROM votes');
    expect(Number(rows[0].weight)).toBe(1);
  });

  it('rejects a malformed voter address', async () => {
    await expect(insertVote({ voterAddress: 'not-a-stellar-address' })).rejects.toThrow(
      /votes_voter_address_format/
    );
  });

  it('rejects an unknown choice', async () => {
    await expect(insertVote({ choice: 'maybe' })).rejects.toThrow(/votes_choice_check/);
  });

  it('accepts every valid choice', async () => {
    await insertVote({ choice: 'for', voterAddress: VALID_ADDRESS });
    await insertVote({ choice: 'against', voterAddress: OTHER_ADDRESS });
    await insertVote({ choice: 'abstain', voterAddress: 'G' + 'J'.repeat(55) });

    const { rows } = await client.query<{ count: string }>('SELECT COUNT(*) AS count FROM votes');
    expect(Number(rows[0].count)).toBe(3);
  });

  it('rejects a negative weight', async () => {
    await expect(insertVote({ weight: -1 })).rejects.toThrow(/votes_weight_check/);
  });

  it('rejects an implausibly large weight', async () => {
    await expect(insertVote({ weight: '1000000000001' })).rejects.toThrow(
      /votes_weight_upper_bound/
    );
  });

  it('rejects an over-long reason', async () => {
    await expect(insertVote({ reason: 'x'.repeat(2001) })).rejects.toThrow(/votes_reason_length/);
  });

  it('rejects a second ballot from the same voter on the same proposal', async () => {
    await insertVote();

    await expect(insertVote({ choice: 'against' })).rejects.toThrow(/votes_unique_per_voter/);
  });

  it('allows the same voter to vote on a different proposal', async () => {
    await insertVote();

    const community = await createCommunity(client, { name: 'SecondBallotDAO' });
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO proposals (community_id, proposer_address, title, voting_ends_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [community.id, VALID_ADDRESS, 'Second proposal', '2030-01-01T00:00:00Z']
    );
    await insertVote({ proposalId: rows[0].id });

    const { rows: counted } = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM votes'
    );
    expect(Number(counted[0].count)).toBe(2);
  });

  it('lets a voter change their mind in place', async () => {
    await insertVote({ choice: 'for' });

    await client.query(
      `INSERT INTO votes (proposal_id, voter_address, choice)
       VALUES ($1, $2, $3)
       ON CONFLICT (proposal_id, voter_address)
       DO UPDATE SET choice = EXCLUDED.choice`,
      [proposalId, VALID_ADDRESS, 'against']
    );

    const { rows } = await client.query<{ choice: string; count: string }>(
      'SELECT choice, COUNT(*) OVER () AS count FROM votes'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].choice).toBe('against');
  });

  it('rejects a duplicate vote transaction hash', async () => {
    await insertVote({ stellarTxHash: 'a'.repeat(64) });

    await expect(
      insertVote({ voterAddress: OTHER_ADDRESS, stellarTxHash: 'a'.repeat(64) })
    ).rejects.toThrow(/votes_stellar_tx_hash_key/);
  });

  it('cascades ballot deletion when the proposal is deleted', async () => {
    await insertVote();

    await client.query('DELETE FROM proposals WHERE id = $1', [proposalId]);

    const { rows } = await client.query('SELECT 1 FROM votes');
    expect(rows).toHaveLength(0);
  });

  it('cascades ballot deletion when the owning community is deleted', async () => {
    await insertVote();

    await client.query(
      `DELETE FROM communities WHERE id = (SELECT community_id FROM proposals WHERE id = $1)`,
      [proposalId]
    );

    const { rows } = await client.query('SELECT 1 FROM votes');
    expect(rows).toHaveLength(0);
  });
});
