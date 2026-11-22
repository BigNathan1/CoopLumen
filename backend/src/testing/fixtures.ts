import { Pool, PoolClient } from 'pg';
import { seedBaselineData, type SeededDatabase } from '../db/seed-data';

export const TEST_ISSUER_1 = 'G' + 'A'.repeat(55);
export const TEST_ISSUER_2 = 'G' + 'B'.repeat(55);
export const TEST_MEMBERS = ['G' + 'C'.repeat(55), 'G' + 'D'.repeat(55), 'G' + 'E'.repeat(55)];

export interface TestCommunity {
  id: string;
  name: string;
  asset_code: string;
  asset_issuer: string;
  issuer_public_key: string;
}

export interface TestMember {
  community_id: string;
  stellar_address: string;
  role: string;
}

export async function createCommunity(
  client: PoolClient,
  overrides: Partial<{
    name: string;
    description: string;
    issuerPublicKey: string;
    assetCode: string;
    assetIssuer: string;
  }> = {}
): Promise<TestCommunity> {
  const result = await client.query<TestCommunity>(
    `INSERT INTO communities (name, description, issuer_public_key, asset_code, asset_issuer)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, asset_code, asset_issuer, issuer_public_key`,
    [
      overrides.name ?? 'TestDAO',
      overrides.description ?? null,
      overrides.issuerPublicKey ?? TEST_ISSUER_1,
      overrides.assetCode ?? 'TDAO',
      overrides.assetIssuer ?? TEST_ISSUER_1,
    ]
  );
  return result.rows[0];
}

export async function createMember(
  client: PoolClient,
  communityId: string,
  stellarAddress: string = TEST_MEMBERS[0],
  role: string = 'member'
): Promise<TestMember> {
  const result = await client.query<TestMember>(
    `INSERT INTO members (community_id, stellar_address, role)
     VALUES ($1, $2, $3)
     RETURNING community_id, stellar_address, role`,
    [communityId, stellarAddress, role]
  );
  return result.rows[0];
}

export interface TestProposal {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  status: string;
  voting_starts_at: Date;
  voting_ends_at: Date;
  executed_at: Date | null;
  stellar_tx_hash: string | null;
}

export async function createProposal(
  client: PoolClient,
  communityId: string,
  overrides: Partial<{
    title: string;
    description: string | null;
    status: string;
    votingStartsAt: Date;
    votingEndsAt: Date;
    executedAt: Date | null;
    stellarTxHash: string | null;
  }> = {}
): Promise<TestProposal> {
  const now = Date.now();
  const result = await client.query<TestProposal>(
    `INSERT INTO proposals
       (community_id, title, description, status, voting_starts_at, voting_ends_at, executed_at, stellar_tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, community_id, title, description, status,
               voting_starts_at, voting_ends_at, executed_at, stellar_tx_hash`,
    [
      communityId,
      overrides.title ?? 'Test Proposal',
      overrides.description ?? null,
      overrides.status ?? 'active',
      overrides.votingStartsAt ?? new Date(now - 60 * 60 * 1000),
      overrides.votingEndsAt ?? new Date(now + 60 * 60 * 1000),
      overrides.executedAt ?? null,
      overrides.stellarTxHash ?? null,
    ]
  );
  return result.rows[0];
}

export async function truncateAll(client: PoolClient): Promise<void> {
  await client.query(`
    TRUNCATE TABLE
      multisig_requests,
      audit_log,
      notifications,
      community_settings,
      reputation_scores,
      transactions_log,
      tokens,
      loan_events,
      trustlines,
      payments,
      loans,
      proposals,
      members,
      communities
    RESTART IDENTITY CASCADE
  `);
}

export async function seedTestDatabase(client: PoolClient): Promise<SeededDatabase> {
  await truncateAll(client);
  return seedBaselineData(client);
}

export function makeTestPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set — integration tests require a real database');
  return new Pool({ connectionString: url });
}
