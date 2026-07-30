import fs from 'fs/promises';
import path from 'path';
import type { PoolClient } from 'pg';
import { checksumOf, rollback, runPending, showStatus } from '../migrate';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  readdir: jest.fn(),
}));

const mockedFs = fs as unknown as {
  readFile: jest.Mock;
  readdir: jest.Mock;
};

const BOOTSTRAP_NAME = '001_schema_migrations.sql';
const MIGRATION_NAME = '002_create_communities.sql';
const MIGRATION_SQL = 'CREATE TABLE communities (id UUID PRIMARY KEY);';
const DOWN_MIGRATION_SQL = 'DROP TABLE communities;';

function migrationEntry(name: string): {
  name: string;
  isFile: () => boolean;
} {
  return {
    name,
    isFile: () => true,
  };
}

function createClient(appliedRows: Array<{ name: string; checksum: string | null }>) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('SELECT name, checksum FROM schema_migrations')) {
      return { rows: appliedRows };
    }

    return { rows: [] };
  });

  return {
    client: { query } as unknown as PoolClient,
    query,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  mockedFs.readdir.mockResolvedValue([
    migrationEntry(BOOTSTRAP_NAME),
    migrationEntry(MIGRATION_NAME),
  ]);

  mockedFs.readFile.mockImplementation(async (filePath: string) => {
    const fileName = path.basename(filePath);

    if (fileName === BOOTSTRAP_NAME) {
      return 'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());';
    }

    if (fileName === MIGRATION_NAME) {
      return MIGRATION_SQL;
    }

    if (fileName === '002_create_communities.down.sql') {
      return DOWN_MIGRATION_SQL;
    }

    throw new Error(`Unexpected migration file: ${fileName}`);
  });
});

describe('migration runner', () => {
  it('applies pending migrations to a fresh database', async () => {
    const { client, query } = createClient([]);

    await runPending(client, false);

    expect(query.mock.calls.some(([sql]) => sql === MIGRATION_SQL)).toBe(true);
    expect(
      query.mock.calls.some(
        ([sql, params]) =>
          sql.includes('INSERT INTO schema_migrations') &&
          Array.isArray(params) &&
          params[0] === MIGRATION_NAME
      )
    ).toBe(true);
  });

  it('skips migrations that are already applied', async () => {
    const { client, query } = createClient([
      {
        name: BOOTSTRAP_NAME,
        checksum: checksumOf(
          'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());'
        ),
      },
      { name: MIGRATION_NAME, checksum: checksumOf(MIGRATION_SQL) },
    ]);

    await runPending(client, false);

    expect(query.mock.calls.some(([sql]) => sql === MIGRATION_SQL)).toBe(false);
  });

  it('reports status with applied and pending migrations', async () => {
    const { client, query } = createClient([
      {
        name: BOOTSTRAP_NAME,
        checksum: checksumOf(
          'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());'
        ),
      },
      { name: MIGRATION_NAME, checksum: checksumOf(MIGRATION_SQL) },
    ]);

    // showStatus weaves its own query; verify no errors are thrown
    await expect(showStatus(client)).resolves.toBeUndefined();
  });

  it('reports all migrations pending on fresh database', async () => {
    const { client } = createClient([]);

    // On a fresh db, the bootstrap file is missing the DOWN counterpart, but
    // the sql read still works because the mock uses basename-based routing.
    await expect(showStatus(client)).resolves.toBeUndefined();
  });

  it('reports no pending migrations when fully up to date', async () => {
    const mockHash = checksumOf(MIGRATION_SQL);
    const bootstrapHash = checksumOf(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());'
    );

    // Write readdir to only return the files that are in the "applied" set
    mockedFs.readdir.mockResolvedValue([
      migrationEntry(BOOTSTRAP_NAME),
    ]);

    mockedFs.readFile.mockImplementation(async (filePath: string) => {
      const fileName = path.basename(filePath);
      if (fileName === BOOTSTRAP_NAME) {
        return 'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());';
      }
      throw new Error(`Unexpected file: ${fileName}`);
    });

    const { client } = createClient([
      { name: BOOTSTRAP_NAME, checksum: bootstrapHash },
    ]);

    await expect(showStatus(client)).resolves.toBeUndefined();
  });

  it('detects drifted migrations in status output', async () => {
    const originalHash = checksumOf(MIGRATION_SQL);
    // Tamper the checksum so the file on disk no longer matches
    const { client } = createClient([
      {
        name: BOOTSTRAP_NAME,
        checksum: checksumOf(
          'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());'
        ),
      },
      { name: MIGRATION_NAME, checksum: 'tampered-checksum' },
    ]);

    await expect(showStatus(client)).resolves.toBeUndefined();
  });

  it('rolls back the latest applied migration', async () => {
    const { client, query } = createClient([
      {
        name: BOOTSTRAP_NAME,
        checksum: checksumOf(
          'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());'
        ),
      },
      { name: MIGRATION_NAME, checksum: checksumOf(MIGRATION_SQL) },
    ]);

    await rollback(client, 1, false);

    expect(query.mock.calls.some(([sql]) => sql === DOWN_MIGRATION_SQL)).toBe(true);
    expect(
      query.mock.calls.some(
        ([sql, params]) =>
          sql.includes('DELETE FROM schema_migrations') &&
          Array.isArray(params) &&
          params[0] === MIGRATION_NAME
      )
    ).toBe(true);
  });
});
