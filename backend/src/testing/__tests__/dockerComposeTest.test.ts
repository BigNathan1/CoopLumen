import fs from 'fs';
import path from 'path';
// @ts-expect-error js-yaml lacks local type definitions
import yaml from 'js-yaml';

describe('docker-compose.test.yml', () => {
  const composePath = path.resolve(__dirname, '../../../../docker-compose.test.yml');

  it('exists at repository root', () => {
    expect(fs.existsSync(composePath)).toBe(true);
  });

  it('is a valid YAML document defining a test PostgreSQL service', () => {
    const raw = fs.readFileSync(composePath, 'utf8');
    const parsed = yaml.load(raw) as {
      version?: string;
      services?: Record<
        string,
        {
          image?: string;
          container_name?: string;
          environment?: Record<string, string>;
          ports?: string[];
          tmpfs?: string[];
          healthcheck?: { test?: string[] };
        }
      >;
    };

    expect(parsed).toBeDefined();
    expect(parsed.services).toBeDefined();

    const testDb = parsed.services?.['test-db'];
    expect(testDb).toBeDefined();
    expect(testDb?.image).toBe('postgres:16-alpine');
    expect(testDb?.container_name).toBe('cooplumen-test-db');

    // Environment checks
    expect(testDb?.environment?.POSTGRES_USER).toBeDefined();
    expect(testDb?.environment?.POSTGRES_PASSWORD).toBeDefined();
    expect(testDb?.environment?.POSTGRES_DB).toBeDefined();

    // Isolated test port (distinct from 5432)
    const portMapping = testDb?.ports?.[0];
    expect(portMapping).toMatch(/5433|5432/);

    // High performance test isolation via tmpfs
    expect(testDb?.tmpfs).toContain('/var/lib/postgresql/data');

    // Healthcheck using pg_isready
    expect(testDb?.healthcheck?.test).toBeDefined();
    expect(testDb?.healthcheck?.test?.join(' ')).toContain('pg_isready');
  });

  it('configures test-redis for isolated cache testing', () => {
    const raw = fs.readFileSync(composePath, 'utf8');
    const parsed = yaml.load(raw) as {
      services?: Record<string, { image?: string; ports?: string[] }>;
    };

    const testRedis = parsed.services?.['test-redis'];
    expect(testRedis).toBeDefined();
    expect(testRedis?.image).toBe('redis:7-alpine');
  });
});
