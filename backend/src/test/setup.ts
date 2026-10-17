import { Pool, PoolClient } from 'pg';
import { ensureSchemaMigrationsTable, runPending } from '../db/migrate';
import { seedBaselineData, SeededDatabase } from '../db/seed-data';
import { logger } from '../utils/logger';

export interface SetupOptions {
  seed?: boolean;
  client?: PoolClient;
  pool?: Pool;
  connectionString?: string;
}

export interface SetupResult {
  pool: Pool;
  client?: PoolClient;
  seeded?: SeededDatabase;
}

/**
 * Runs all pending migrations against the connected PostgreSQL database.
 */
export async function runMigrations(client: PoolClient): Promise<void> {
  await ensureSchemaMigrationsTable(client);
  await runPending(client, false);
}

/**
 * Seeds the database with baseline test fixtures (EcoDAO, AgriCoop, members, settings).
 */
export async function runSeeds(client: PoolClient): Promise<SeededDatabase> {
  return seedBaselineData(client);
}

/**
 * Runs migrations and baseline seeds against the test PostgreSQL database.
 * Used before running test suites to ensure schema integrity and baseline data.
 */
export async function setupTestDatabase(options: SetupOptions = {}): Promise<SetupResult> {
  const connectionString =
    options.connectionString ??
    process.env.DATABASE_URL ??
    'postgresql://cooplumen:cooplumen@localhost:5432/cooplumen';

  const ownPool = !options.pool && !options.client;
  const pool = options.pool ?? (options.client ? undefined : new Pool({ connectionString }))!;

  const client = options.client ?? (await pool.connect());
  let seeded: SeededDatabase | undefined;

  try {
    logger.info('Running database migrations for test setup...');
    await runMigrations(client);

    if (options.seed !== false) {
      logger.info('Running database seeds for test setup...');
      seeded = await runSeeds(client);
    }

    return { pool, client: options.client, seeded };
  } finally {
    if (!options.client) {
      client.release();
    }
    if (ownPool && !options.pool) {
      // Keep pool active unless explicitly managed by caller, or allow caller to close it.
    }
  }
}

export const setup = setupTestDatabase;
export default setupTestDatabase;
