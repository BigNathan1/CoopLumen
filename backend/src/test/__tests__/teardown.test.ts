import { Pool, PoolClient } from 'pg';
import {
  truncateTables,
  teardownTestSuite,
  getTablesToTruncate,
  KNOWN_TABLES,
  teardown,
} from '../teardown';
import { setupTestDatabase } from '../setup';

const RUN_INTEGRATION = Boolean(process.env.DATABASE_URL);
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

describe('backend/src/test/teardown.ts (unit)', () => {
  it('exports required teardown utilities and defaults', () => {
    expect(typeof truncateTables).toBe('function');
    expect(typeof teardownTestSuite).toBe('function');
    expect(typeof getTablesToTruncate).toBe('function');
    expect(teardown).toBe(teardownTestSuite);
    expect(Array.isArray(KNOWN_TABLES)).toBe(true);
    expect(KNOWN_TABLES).toContain('communities');
    expect(KNOWN_TABLES).not.toContain('schema_migrations');
  });

  it('queries public tables excluding schema_migrations', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({
        rows: [{ tablename: 'communities' }, { tablename: 'members' }],
      }),
    } as unknown as PoolClient;

    const tables = await getTablesToTruncate(mockClient);
    expect(tables).toEqual(['communities', 'members']);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("tablename != 'schema_migrations'")
    );
  });

  it('falls back to KNOWN_TABLES on database query error', async () => {
    const mockClient = {
      query: jest.fn().mockRejectedValue(new Error('connection closed')),
    } as unknown as PoolClient;

    const tables = await getTablesToTruncate(mockClient);
    expect(tables).toEqual(KNOWN_TABLES);
  });

  it('constructs TRUNCATE with RESTART IDENTITY CASCADE', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as PoolClient;

    await truncateTables(mockClient, ['communities', 'members']);
    expect(mockClient.query).toHaveBeenCalledWith(
      'TRUNCATE TABLE "communities", "members" RESTART IDENTITY CASCADE;'
    );
  });
});

describeIntegration('backend/src/test/teardown.ts (integration)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('truncates all test tables while preserving schema_migrations', async () => {
    const client = await pool.connect();
    try {
      // 1. Ensure setup & seeds
      await setupTestDatabase({ client, pool, seed: true });

      const before = await client.query('SELECT COUNT(*) FROM communities');
      expect(Number(before.rows[0].count)).toBeGreaterThan(0);

      // 2. Teardown
      await teardownTestSuite({ client, pool });

      // 3. Confirm tables are empty
      const after = await client.query('SELECT COUNT(*) FROM communities');
      expect(Number(after.rows[0].count)).toBe(0);

      // 4. Confirm schema_migrations was preserved
      const migrations = await client.query('SELECT COUNT(*) FROM schema_migrations');
      expect(Number(migrations.rows[0].count)).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });
});
