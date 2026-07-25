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

    // The migration runner always records into public.schema_migrations, so
    // query it explicitly rather than relying on the session search_path.
    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM public.schema_migrations ORDER BY name'
    );
    const applied = rows.map((r) => r.name);

    expect(applied).toEqual(expect.arrayContaining(files));
  });

  it('records the bootstrap migration exactly once', async () => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM public.schema_migrations WHERE name = $1`,
      ['001_schema_migrations.sql']
    );

    expect(Number(rows[0].count)).toBe(1);
  });

  it('schema_migrations is keyed on name and indexed on applied_at', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'schema_migrations'`
    );
    const definitions = rows.map((r) => r.indexdef).join('\n');

    expect(definitions).toMatch(/UNIQUE INDEX schema_migrations_pkey .*\(name\)/);
    expect(definitions).toMatch(/idx_schema_migrations_applied_at .*\(applied_at\)/);
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
      'multisig_requests',
      'proposals',
      'votes',
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
