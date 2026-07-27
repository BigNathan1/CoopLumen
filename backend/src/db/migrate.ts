import 'dotenv/config';
import { createHash } from 'crypto';
import type { Dirent } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationsDirectory = path.join(__dirname, 'migrations');

/**
 * Session-level advisory lock held for the duration of a migrate/rollback run.
 * Two runners starting at once (rolling deploy, `docker-compose up` with
 * replicas) would otherwise both read the same pending list and apply the same
 * file twice. The value is arbitrary but must stay stable across releases.
 */
const ADVISORY_LOCK_KEY = 4282197;

/** `NNN_snake_case_name.sql` — the numeric prefix defines apply order. */
const MIGRATION_FILE_PATTERN = /^(\d+)_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

interface AppliedMigrationRow {
  name: string;
  checksum: string | null;
}

/**
 * Migration that creates the tracking table itself. It cannot be applied
 * through the normal path — the table it creates is what records applications —
 * so the runner executes it up front and marks it applied.
 */
export const BOOTSTRAP_MIGRATION = '001_schema_migrations.sql';

/** Migration name → checksum recorded when it was applied (null for legacy rows). */
export type AppliedMigrations = Map<string, string | null>;

export interface CliOptions {
  command: 'up' | 'status' | 'rollback';
  steps: number;
  dryRun: boolean;
}

export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

/** Numeric prefix first so `010_…` never sorts ahead of `9_…`. */
function compareMigrations(left: string, right: string): number {
  const leftVersion = Number(MIGRATION_FILE_PATTERN.exec(left)?.[1] ?? Number.MAX_SAFE_INTEGER);
  const rightVersion = Number(MIGRATION_FILE_PATTERN.exec(right)?.[1] ?? Number.MAX_SAFE_INTEGER);
  return leftVersion - rightVersion || left.localeCompare(right);
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
    // `checksum` was added after the table shipped; databases migrated before
    // then keep NULL and are skipped by drift detection.
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT;');
    await client.query(
      'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [BOOTSTRAP_MIGRATION]
    );
    if (sql) {
      await client.query(
        'UPDATE schema_migrations SET checksum = $1 WHERE name = $2 AND checksum IS NULL',
        [checksumOf(sql), BOOTSTRAP_MIGRATION]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function listMigrationFiles(): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const names = entries
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.sql') && !entry.name.endsWith('.down.sql')
    )
    .map((entry) => entry.name);

  const invalid = names.filter((name) => !MIGRATION_FILE_PATTERN.test(name));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid migration filename(s): ${invalid.join(', ')}. ` +
        'Expected NNN_snake_case_name.sql (for example 017_add_member_role.sql).'
    );
  }

  return names.sort(compareMigrations);
}

export async function getAppliedMigrations(client: PoolClient): Promise<AppliedMigrations> {
  const result = await client.query<AppliedMigrationRow>(
    'SELECT name, checksum FROM schema_migrations ORDER BY applied_at ASC, name ASC'
  );
  return new Map(result.rows.map((row) => [row.name, row.checksum ?? null]));
}

/**
 * Compares each applied migration against the file still on disk. Editing a
 * migration that has already run leaves environments silently diverged, so the
 * runner refuses to continue until the edit is reverted or moved into a new
 * migration.
 */
export async function findDriftedMigrations(applied: AppliedMigrations): Promise<string[]> {
  const drifted: string[] = [];

  for (const [fileName, recordedChecksum] of applied) {
    if (!recordedChecksum) {
      continue;
    }

    let sql: string;
    try {
      sql = await fs.readFile(path.join(migrationsDirectory, fileName), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn('Applied migration is missing from disk', { fileName });
        continue;
      }

      throw error;
    }

    if (checksumOf(sql) !== recordedChecksum) {
      drifted.push(fileName);
    }
  }

  return drifted;
}

export async function applyMigration(client: PoolClient, fileName: string): Promise<void> {
  const filePath = path.join(migrationsDirectory, fileName);
  const sql = await fs.readFile(filePath, 'utf8');

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
      fileName,
      checksumOf(sql),
    ]);
    await client.query('COMMIT');
    logger.info('Applied migration', { fileName });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function withAdvisoryLock<T>(client: PoolClient, run: () => Promise<T>): Promise<T> {
  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
  try {
    return await run();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
  }
}

export function parseArgs(argv: string[]): CliOptions {
  const dryRun = argv.includes('--dry-run');

  if (argv.includes('--status')) {
    return { command: 'status', steps: 0, dryRun };
  }

  const rollbackIndex = argv.indexOf('--rollback');
  if (rollbackIndex !== -1) {
    const parsed = Number.parseInt(argv[rollbackIndex + 1] ?? '1', 10);
    return {
      command: 'rollback',
      steps: Number.isNaN(parsed) || parsed < 1 ? 1 : parsed,
      dryRun,
    };
  }

  return { command: 'up', steps: 0, dryRun };
}

async function runPending(client: PoolClient, dryRun: boolean): Promise<void> {
  await ensureSchemaMigrationsTable(client);
  const applied = await getAppliedMigrations(client);

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

  const pending = (await listMigrationFiles()).filter((fileName) => !applied.has(fileName));

  if (pending.length === 0) {
    logger.info('No pending migrations');
    return;
  }

  if (dryRun) {
    logger.info('Dry run — migrations that would be applied', { pending });
    pending.forEach((name) => console.log(`  would apply ${name}`));
    return;
  }

  for (const fileName of pending) {
    await applyMigration(client, fileName);
  }

  logger.info('Migrations applied successfully', { count: pending.length });
}

async function rollback(client: PoolClient, steps: number, dryRun: boolean): Promise<void> {
  await ensureSchemaMigrationsTable(client);
  const applied = [...(await getAppliedMigrations(client)).keys()]
    .sort(compareMigrations)
    .reverse();
  const toRollback = applied.slice(0, steps);

  if (toRollback.length === 0) {
    logger.info('Nothing to roll back');
    return;
  }

  if (dryRun) {
    logger.info('Dry run — migrations that would be rolled back', { toRollback });
    toRollback.forEach((name) => console.log(`  would roll back ${name}`));
    return;
  }

  for (const fileName of toRollback) {
    const downFileName = fileName.replace(/\.sql$/, '.down.sql');
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
}

async function showStatus(client: PoolClient): Promise<void> {
  await ensureSchemaMigrationsTable(client);
  const applied = await getAppliedMigrations(client);
  const drifted = await findDriftedMigrations(applied);
  const pending = (await listMigrationFiles()).filter((fileName) => !applied.has(fileName));
  const appliedNames = [...applied.keys()].sort(compareMigrations);

  logger.info('Migration status', { applied: appliedNames, pending, drifted });

  console.log('Applied migrations:');
  appliedNames.forEach((name) => console.log(`  - ${name}`));
  console.log('\nPending migrations:');
  pending.forEach((name) => console.log(`  - ${name}`));

  if (drifted.length > 0) {
    console.log('\nChanged since they were applied (drift):');
    drifted.forEach((name) => console.log(`  ! ${name}`));
  }
}

async function migrate(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const client = await pool.connect();

  try {
    await withAdvisoryLock(client, async () => {
      switch (options.command) {
        case 'status':
          return showStatus(client);
        case 'rollback':
          return rollback(client, options.steps, options.dryRun);
        default:
          return runPending(client, options.dryRun);
      }
    });
  } catch (error) {
    logger.error('Migration runner failed', error);
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
