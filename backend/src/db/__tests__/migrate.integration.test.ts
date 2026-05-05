/**
 * Integration test: verifies all migrations apply cleanly on a fresh schema.
 * Requires DATABASE_URL pointing at a running PostgreSQL instance.
 * Skipped automatically when DATABASE_URL is not set.
 */

import { Pool } from 'pg';
import { makeTestPool } from '../../test/fixtures';

const RUN = Boolean(process.env.DATABASE_URL);

const describeIf = RUN ? describe : describe.skip;

describeIf('Migration integration', () => {
  let pool: Pool;
  const TEST_SCHEMA = `migrate_test_${Date.now()}`;

  beforeAll(async () => {
    pool = makeTestPool();
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);
    await pool.query(`SET search_path TO "${TEST_SCHEMA}"`);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    await pool.end();
  });

  it('applies all migrations in order without error', async () => {
    const { execSync } = await import('child_process');
    execSync('npm run db:migrate', {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: 'pipe',
    });
  });

  it('schema_migrations contains every migration file', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const migrationsDir = path.join(__dirname, '..', 'migrations');

    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name'
    );
    const applied = rows.map((r) => r.name);

    expect(applied).toEqual(expect.arrayContaining(files));
  });

  it('running db:migrate a second time is a no-op', async () => {
    const { execSync } = await import('child_process');
    const output = execSync('npm run db:migrate', {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: 'pipe',
    }).toString();

    expect(output).toMatch(/No pending migrations/i);
  });

  it('all expected tables exist after migration', async () => {
    const expectedTables = [
      'communities',
      'members',
      'loans',
      'payments',
      'trustlines',
      'loan_events',
      'tokens',
      'transactions_log',
      'reputation_scores',
      'community_settings',
      'notifications',
      'audit_log',
    ];

    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const tables = rows.map((r) => r.tablename);

    for (const table of expectedTables) {
      expect(tables).toContain(table);
    }
  });
});
