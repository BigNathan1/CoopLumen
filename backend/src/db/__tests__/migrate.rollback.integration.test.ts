import fs from 'fs/promises';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { runPending, rollback } from '../migrate';

const RUN = Boolean(process.env.DATABASE_URL);
const describeIf = RUN ? describe : describe.skip;

describeIf('rollback', () => {
  const migrationsDirectory = path.join(__dirname, '..', 'migrations');
  let pool: Pool;
  let client: PoolClient;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  it('should rollback the last migration', async () => {
    // Create a dummy migration file
    const migrationName = '999_dummy_migration.sql';
    const downMigrationName = '999_dummy_migration.down.sql';
    const migrationPath = path.join(migrationsDirectory, migrationName);
    const downMigrationPath = path.join(migrationsDirectory, downMigrationName);

    await fs.writeFile(migrationPath, 'CREATE TABLE dummy_table (id INT);');
    await fs.writeFile(downMigrationPath, 'DROP TABLE dummy_table;');

    try {
      // Run the pending-migrations step to apply the dummy migration
      await runPending(client, false);

      // Check that the table was created
      let result = await client.query("SELECT to_regclass('public.dummy_table') as table_exists;");
      expect(result.rows[0].table_exists).toBe('dummy_table');

      // Run rollback
      await rollback(client, 1, false);

      // Check that the table was dropped
      result = await client.query("SELECT to_regclass('public.dummy_table') as table_exists;");
      expect(result.rows[0].table_exists).toBeNull();
    } finally {
      // Cleanup the dummy migration files
      await fs.unlink(migrationPath);
      await fs.unlink(downMigrationPath);
    }
  });
});
