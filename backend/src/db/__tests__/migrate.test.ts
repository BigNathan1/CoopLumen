import fs from 'fs/promises';
import { PoolClient } from 'pg';
import {
  listMigrationFiles,
  ensureSchemaMigrationsTable,
  getAppliedMigrations,
  applyMigration,
  checksumOf,
  findDriftedMigrations,
  parseArgs,
} from '../migrate';

jest.mock('fs/promises');
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

beforeEach(() => {
  jest.clearAllMocks();
});

function makeClient(queryResults: Record<string, unknown[][]> = {}): jest.Mocked<PoolClient> {
  const client = {
    query: jest.fn(async (text: string, _params?: unknown[]) => {
      const key = Object.keys(queryResults).find((k) => text.includes(k));
      return { rows: key ? (queryResults[key].shift() ?? []) : [], rowCount: 0 };
    }),
    release: jest.fn(),
  } as unknown as jest.Mocked<PoolClient>;
  return client;
}

describe('listMigrationFiles', () => {
  it('returns sorted .sql files, excluding .down.sql files', async () => {
    mockFs.readdir.mockResolvedValueOnce([
      { name: '002_core_schema.sql', isFile: () => true },
      { name: '001_schema_migrations.sql', isFile: () => true },
      { name: '001_schema_migrations.down.sql', isFile: () => true },
      { name: '003_trigger.sql', isFile: () => true },
      { name: 'README.md', isFile: () => true },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const files = await listMigrationFiles();

    expect(files).toEqual(['001_schema_migrations.sql', '002_core_schema.sql', '003_trigger.sql']);
  });

  it('returns [] when migrations directory does not exist', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockFs.readdir.mockRejectedValueOnce(err);

    const files = await listMigrationFiles();

    expect(files).toEqual([]);
  });

  it('re-throws non-ENOENT errors', async () => {
    mockFs.readdir.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(listMigrationFiles()).rejects.toThrow('Permission denied');
  });

  it('orders by numeric version, not lexicographically', async () => {
    mockFs.readdir.mockResolvedValueOnce([
      { name: '10_ten.sql', isFile: () => true },
      { name: '9_nine.sql', isFile: () => true },
      { name: '100_hundred.sql', isFile: () => true },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const files = await listMigrationFiles();

    expect(files).toEqual(['9_nine.sql', '10_ten.sql', '100_hundred.sql']);
  });

  it('falls back to the filename when two migrations share a version prefix', async () => {
    mockFs.readdir.mockResolvedValueOnce([
      { name: '002_create_communities.sql', isFile: () => true },
      { name: '002_core_schema.sql', isFile: () => true },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const files = await listMigrationFiles();

    expect(files).toEqual(['002_core_schema.sql', '002_create_communities.sql']);
  });

  it('throws on a .sql file that does not follow the naming convention', async () => {
    mockFs.readdir.mockResolvedValueOnce([
      { name: '001_schema_migrations.sql', isFile: () => true },
      { name: 'ad-hoc-fix.sql', isFile: () => true },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    await expect(listMigrationFiles()).rejects.toThrow('ad-hoc-fix.sql');
  });
});

describe('parseArgs', () => {
  it('defaults to running pending migrations', () => {
    expect(parseArgs([])).toEqual({ command: 'up', steps: 0, dryRun: false });
  });

  it('recognises --status', () => {
    expect(parseArgs(['--status'])).toMatchObject({ command: 'status' });
  });

  it('defaults --rollback to a single step', () => {
    expect(parseArgs(['--rollback'])).toMatchObject({ command: 'rollback', steps: 1 });
  });

  it('reads the step count that follows --rollback', () => {
    expect(parseArgs(['--rollback', '3'])).toMatchObject({ command: 'rollback', steps: 3 });
  });

  it('falls back to one step for a non-numeric or zero step count', () => {
    expect(parseArgs(['--rollback', 'two'])).toMatchObject({ steps: 1 });
    expect(parseArgs(['--rollback', '0'])).toMatchObject({ steps: 1 });
  });

  it('recognises --dry-run alongside any command', () => {
    expect(parseArgs(['--rollback', '2', '--dry-run'])).toEqual({
      command: 'rollback',
      steps: 2,
      dryRun: true,
    });
  });
});

describe('ensureSchemaMigrationsTable', () => {
  it('runs CREATE TABLE IF NOT EXISTS', async () => {
    const client = makeClient();
    await ensureSchemaMigrationsTable(client);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
    );
  });

  it('backfills the checksum column on databases created before it existed', async () => {
    const client = makeClient();
    await ensureSchemaMigrationsTable(client);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS checksum')
    );
  });
});

describe('getAppliedMigrations', () => {
  it('maps applied migration names to their recorded checksum', async () => {
    const client = makeClient({
      'SELECT name': [
        [
          { name: '001_schema_migrations.sql', checksum: 'abc' },
          { name: '002_core_schema.sql', checksum: 'def' },
        ],
      ],
    });

    const applied = await getAppliedMigrations(client);

    expect(applied).toEqual(
      new Map([
        ['001_schema_migrations.sql', 'abc'],
        ['002_core_schema.sql', 'def'],
      ])
    );
  });

  it('normalises a missing checksum to null', async () => {
    const client = makeClient({
      'SELECT name': [[{ name: '001_schema_migrations.sql', checksum: null }]],
    });

    const applied = await getAppliedMigrations(client);

    expect(applied.get('001_schema_migrations.sql')).toBeNull();
  });

  it('returns an empty Map when no migrations have been applied', async () => {
    const client = makeClient({ 'SELECT name': [[]] });

    const applied = await getAppliedMigrations(client);

    expect(applied.size).toBe(0);
  });
});

describe('findDriftedMigrations', () => {
  it('reports a migration whose file changed after it was applied', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFs.readFile.mockResolvedValueOnce('ALTER TABLE communities ADD COLUMN x TEXT;' as any);

    const drifted = await findDriftedMigrations(new Map([['002_core_schema.sql', 'stale-hash']]));

    expect(drifted).toEqual(['002_core_schema.sql']);
  });

  it('reports nothing when the checksum still matches', async () => {
    const sql = 'CREATE TABLE foo (id UUID);';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFs.readFile.mockResolvedValueOnce(sql as any);

    const drifted = await findDriftedMigrations(
      new Map([['002_core_schema.sql', checksumOf(sql)]])
    );

    expect(drifted).toEqual([]);
  });

  it('skips rows recorded before checksums were tracked', async () => {
    const drifted = await findDriftedMigrations(new Map([['002_core_schema.sql', null]]));

    expect(drifted).toEqual([]);
    expect(mockFs.readFile).not.toHaveBeenCalled();
  });

  it('warns instead of failing when an applied migration file was deleted', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockFs.readFile.mockRejectedValueOnce(err);

    const drifted = await findDriftedMigrations(new Map([['999_gone.sql', 'some-hash']]));

    expect(drifted).toEqual([]);
  });
});

describe('applyMigration', () => {
  it('runs the SQL file inside a transaction and records it in schema_migrations', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFs.readFile.mockResolvedValueOnce('CREATE TABLE foo (id UUID);' as any);
    const client = makeClient();

    await applyMigration(client, '002_core_schema.sql');

    const calls = client.query.mock.calls.map(([sql]) => sql as string);
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('CREATE TABLE foo (id UUID);');
    expect(calls.some((s) => s.includes('INSERT INTO schema_migrations'))).toBe(true);
    expect(calls).toContain('COMMIT');
  });

  it('records the file checksum alongside the migration name', async () => {
    const sql = 'CREATE TABLE foo (id UUID);';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFs.readFile.mockResolvedValueOnce(sql as any);
    const client = makeClient();

    await applyMigration(client, '002_core_schema.sql');

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO'), [
      '002_core_schema.sql',
      checksumOf(sql),
    ]);
  });

  it('rolls back and re-throws on SQL error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFs.readFile.mockResolvedValueOnce('BAD SQL;' as any);
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BAD SQL;') throw new Error('syntax error');
      }),
    } as unknown as jest.Mocked<PoolClient>;

    await expect(applyMigration(client, 'bad.sql')).rejects.toThrow('syntax error');

    const calls = client.query.mock.calls.map(([sql]) => sql as string);
    expect(calls).toContain('ROLLBACK');
  });

  it('skips already-applied migrations when checked by caller', async () => {
    const applied = new Set(['001_schema_migrations.sql']);
    const allFiles = ['001_schema_migrations.sql', '002_core_schema.sql'];
    const pending = allFiles.filter((f) => !applied.has(f));

    expect(pending).toEqual(['002_core_schema.sql']);
  });
});
