import fs from 'fs';
import path from 'path';
// @ts-expect-error js-yaml lacks local type definitions
import yaml from 'js-yaml';

type ImageServices = { services?: Record<string, { image?: string }> };

const repoRoot = path.resolve(__dirname, '../../../..');

function loadYaml<T>(file: string): T {
  return yaml.load(fs.readFileSync(path.join(repoRoot, file), 'utf8')) as T;
}

/** The images CI runs the backend tests against. */
function ciServiceImage(name: string): string | undefined {
  const ci = loadYaml<{ jobs?: Record<string, ImageServices> }>('.github/workflows/ci.yml');
  return ci.jobs?.['test-backend']?.services?.[name]?.image;
}

describe('docker-compose.test.yml', () => {
  const composePath = path.join(repoRoot, 'docker-compose.test.yml');

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
    // The same PostgreSQL as local development and CI, whatever its version.
    const devDb = loadYaml<ImageServices>('docker-compose.yml').services?.db;
    expect(testDb?.image).toBe(devDb?.image);
    expect(testDb?.image).toBe(ciServiceImage('postgres'));
    expect(testDb?.container_name).toBe('cooplumen-test-db');

    // Environment checks
    expect(testDb?.environment?.POSTGRES_USER).toBeDefined();
    expect(testDb?.environment?.POSTGRES_PASSWORD).toBeDefined();
    expect(testDb?.environment?.POSTGRES_DB).toBeDefined();

    // Isolated test port (distinct from 5432)
    const portMapping = testDb?.ports?.[0];
    expect(portMapping).toMatch(/5433|5432/);

    // High performance test isolation via tmpfs
    expect(testDb?.tmpfs).toContain('/var/lib/postgresql');

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
    expect(testRedis?.image).toBe(ciServiceImage('redis'));
  });
});
