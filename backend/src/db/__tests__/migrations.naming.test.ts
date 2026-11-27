import fs from 'fs';
import path from 'path';

const migrationsDirectory = path.join(__dirname, '..', 'migrations');

/**
 * Prefixes that more than one migration already shares. They were merged from
 * parallel branches and have been applied to deployed databases under these
 * exact filenames, so they cannot be renumbered: `schema_migrations` records
 * the filename, and a renamed file would run a second time. The runner orders
 * them by filename within a prefix. No prefix may be added to this list.
 */
const LEGACY_SHARED_PREFIXES: Record<string, number> = {
  '002': 2,
  '004': 2,
  '007': 2,
  '012': 2,
  '017': 8,
  '018': 2,
  '019': 2,
  '025': 3,
  '026': 2,
  '027': 2,
  '029': 2,
};

const upMigrations = fs
  .readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith('.sql') && !name.endsWith('.down.sql'));

function prefixOf(name: string): string {
  return name.split('_')[0];
}

describe('migration files', () => {
  it('give every new migration a prefix of its own', () => {
    const counts = new Map<string, number>();
    for (const name of upMigrations) {
      counts.set(prefixOf(name), (counts.get(prefixOf(name)) ?? 0) + 1);
    }
    const shared = Object.fromEntries([...counts].filter(([, count]) => count > 1));

    expect(shared).toEqual(LEGACY_SHARED_PREFIXES);
  });

  it('use three-digit prefixes', () => {
    expect(upMigrations.filter((name) => !/^\d{3}_/.test(name))).toEqual([]);
  });

  it('ship a rollback script with every migration', () => {
    const missing = upMigrations.filter(
      (name) => !fs.existsSync(path.join(migrationsDirectory, name.replace(/\.sql$/, '.down.sql')))
    );

    expect(missing).toEqual([]);
  });
});
