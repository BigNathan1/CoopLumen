import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationsDirectory = path.join(__dirname, 'migrations');

/**
 * Migration that creates the tracking table itself. It cannot be applied
 * through the normal path — the table it creates is what records applications —
 * so the runner executes it up front and marks it applied.
 */
export const BOOTSTRAP_MIGRATION = '001_schema_migrations.sql';

interface AppliedMigration {
  name: string;
}

/**
 * Creates `schema_migrations` by executing the bootstrap migration file, so the
 * SQL lives in exactly one place. The file is idempotent, making this safe to
 * call on every run.
 */
export async function ensureSchemaMigrationsTable(client: PoolClient): Promise<void> {
  const filePath = path.join(migrationsDirectory, BOOTSTRAP_MIGRATION);

  let sql: string;
  try {
    sql = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Bootstrap migration is missing: ${filePath}`);
    }

    throw error;
  }

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [BOOTSTRAP_MIGRATION]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function listMigrationFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.endsWith('.sql') && !entry.name.endsWith('.down.sql')
      )
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<AppliedMigration>(
    'SELECT name FROM schema_migrations ORDER BY applied_at ASC, name ASC'
  );
  return new Set(result.rows.map((row) => row.name));
}

export async function applyMigration(client: PoolClient, fileName: string): Promise<void> {
  const filePath = path.join(migrationsDirectory, fileName);
  const sql = await fs.readFile(filePath, 'utf8');

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [fileName]);
    await client.query('COMMIT');
    logger.info('Applied migration', { fileName });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function rollback(steps: number = 1): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureSchemaMigrationsTable(client);
    const applied = [...(await getAppliedMigrations(client))].sort().reverse();
    const toRollback = applied.slice(0, steps);

    if (toRollback.length === 0) {
      logger.info('Nothing to roll back');
      return;
    }

    for (const fileName of toRollback) {
      const downFileName = fileName.replace('.sql', '.down.sql');
      const filePath = path.join(migrationsDirectory, downFileName);
      let sql: string;
      try {
        sql = await fs.readFile(filePath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.warn('No down file — skipping rollback', { fileName, downFileName });
          continue;
        }
        throw err;
      }

      await client.query('BEGIN');
      try {
        // Delete the bookkeeping row first: the bootstrap migration's down file
        // drops schema_migrations itself, so the DELETE has to happen while the
        // table still exists. Both statements share one transaction.
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [fileName]);
        await client.query(sql);
        await client.query('COMMIT');
        logger.info('Rolled back migration', { fileName });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    logger.info('Rollback complete');
  } catch (error) {
    logger.error('Rollback failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

async function showStatus(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureSchemaMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const pending = (await listMigrationFiles()).filter((fileName) => !applied.has(fileName));

    logger.info('Migration status', {
      applied: [...applied].sort(),
      pending,
    });
    
    // Log applied migrations
    logger.info('Applied migrations:');
    [...applied].sort().forEach((name) => logger.info(`  - ${name}`));
    
    // Log pending migrations
    logger.info('Pending migrations:');
    pending.forEach((name) => logger.info(`  - ${name}`));
  } finally {
    client.release();
    await pool.end();
  }
}

async function migrate(): Promise<void> {
  if (process.argv.includes('--status')) {
    await showStatus();
    return;
  }

  const rollbackIndex = process.argv.indexOf('--rollback');
  if (rollbackIndex !== -1) {
    const steps = parseInt(process.argv[rollbackIndex + 1] ?? '1', 10);
    await rollback(isNaN(steps) ? 1 : steps);
    return;
  }

  const client = await pool.connect();
  try {
    await ensureSchemaMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const pending = (await listMigrationFiles()).filter((fileName) => !applied.has(fileName));

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    for (const fileName of pending) {
      await applyMigration(client, fileName);
    }

    logger.info('Migrations applied successfully');
  } catch (error) {
    logger.error('Migration failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrate().catch((error) => {
    logger.error('Migration runner failed', error);
    process.exitCode = 1;
  });
}
