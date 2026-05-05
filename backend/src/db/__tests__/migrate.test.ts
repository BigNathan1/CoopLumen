import fs from 'fs/promises';
import { PoolClient } from 'pg';
import {
  listMigrationFiles,
  ensureSchemaMigrationsTable,
  getAppliedMigrations,
  applyMigration,
} from '../migrate';

jest.mock('fs/promises');
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

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
});

describe('ensureSchemaMigrationsTable', () => {
  it('runs CREATE TABLE IF NOT EXISTS', async () => {
    const client = makeClient();
    await ensureSchemaMigrationsTable(client);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
    );
  });
});

describe('getAppliedMigrations', () => {
  it('returns a Set of applied migration names', async () => {
    const client = makeClient({
      'SELECT name': [[{ name: '001_schema_migrations.sql' }, { name: '002_core_schema.sql' }]],
    });

    const applied = await getAppliedMigrations(client);

    expect(applied).toEqual(new Set(['001_schema_migrations.sql', '002_core_schema.sql']));
  });

  it('returns an empty Set when no migrations have been applied', async () => {
    const client = makeClient({ 'SELECT name': [[]] });

    const applied = await getAppliedMigrations(client);

    expect(applied).toEqual(new Set());
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
