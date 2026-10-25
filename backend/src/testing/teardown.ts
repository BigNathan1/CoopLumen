import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

export const KNOWN_TABLES = [
  'proposal_delegations',
  'compliance_transfers',
  'kyc_records',
  'idempotency_keys',
  'multisig_requests',
  'votes',
  'proposals',
  'audit_log',
  'notifications',
  'community_settings',
  'reputation_scores',
  'transactions_log',
  'tokens',
  'loan_events',
  'loan_repayments',
  'trustlines',
  'payments',
  'loans',
  'members',
  'communities',
];

export interface TeardownOptions {
  client?: PoolClient;
  pool?: Pool;
  closePool?: boolean;
  connectionString?: string;
  tables?: string[];
}

/**
 * Dynamically queries all public user tables in PostgreSQL, excluding schema_migrations.
 */
export async function getTablesToTruncate(client: PoolClient): Promise<string[]> {
  try {
    const result = await client.query<{ tablename: string }>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public' AND tablename != 'schema_migrations'`
    );
    const tables = result.rows.map((row) => row.tablename);
    return tables.length > 0 ? tables : KNOWN_TABLES;
  } catch (error) {
    logger.warn('Failed to query pg_tables dynamically, falling back to known tables list', error);
    return KNOWN_TABLES;
  }
}

/**
 * Truncates all specified or discovered tables, restarting identity counters with cascade.
 */
export async function truncateTables(
  clientOrPool?: Pool | PoolClient,
  customTables?: string[]
): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://cooplumen:cooplumen@localhost:5432/cooplumen';

  const ownPool = !clientOrPool;
  const pool = ownPool
    ? new Pool({ connectionString })
    : clientOrPool instanceof Pool
      ? clientOrPool
      : undefined;

  let client: PoolClient;
  let clientNeedsRelease = false;

  if (clientOrPool && !(clientOrPool instanceof Pool)) {
    client = clientOrPool;
  } else {
    client = await pool!.connect();
    clientNeedsRelease = true;
  }

  try {
    const tables = customTables ?? (await getTablesToTruncate(client));
    if (tables.length === 0) return;

    const tableList = tables.map((t) => `"${t}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
    logger.info('Database tables truncated successfully', { count: tables.length });
  } finally {
    if (clientNeedsRelease) {
      client.release();
    }
    if (ownPool && pool) {
      await pool.end();
    }
  }
}

/**
 * Teardown runner for test suites: truncates all tables after each test suite.
 */
export async function teardownTestSuite(options: TeardownOptions = {}): Promise<void> {
  const connectionString =
    options.connectionString ??
    process.env.DATABASE_URL ??
    'postgresql://cooplumen:cooplumen@localhost:5432/cooplumen';

  const ownPool = !options.pool && !options.client;
  const pool = options.pool ?? (options.client ? undefined : new Pool({ connectionString }));
  const client = options.client ?? (pool ? await pool.connect() : undefined);

  if (!client) return;

  try {
    await truncateTables(client, options.tables);
  } finally {
    if (!options.client) {
      client.release();
    }
    if ((options.closePool ?? ownPool) && pool) {
      await pool.end();
    }
  }
}

export const teardown = teardownTestSuite;
export default teardownTestSuite;
