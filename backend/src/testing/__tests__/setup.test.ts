import { Pool, PoolClient } from 'pg';
import { setupTestDatabase, runMigrations, runSeeds, setup } from '../setup';

const RUN_INTEGRATION = Boolean(process.env.DATABASE_URL);
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

describe('testing/setup (unit)', () => {
  it('exports required setup utilities and defaults', () => {
    expect(typeof setupTestDatabase).toBe('function');
    expect(typeof runMigrations).toBe('function');
    expect(typeof runSeeds).toBe('function');
    expect(setup).toBe(setupTestDatabase);
  });

  it('invokes seedBaselineData during runSeeds', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'comm-1', name: 'EcoDAO' }] }),
    } as unknown as PoolClient;

    const result = await runSeeds(mockClient);
    expect(result).toBeDefined();
    expect(mockClient.query).toHaveBeenCalled();
  });

  it('runs setupTestDatabase with mocked client without error', async () => {
    const mockClient = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT') &&
          sql.includes('schema_migrations')
        ) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [{ id: 'mock-id', name: 'EcoDAO' }] });
      }),
      release: jest.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
    } as unknown as Pool;

    const res = await setupTestDatabase({ pool: mockPool, client: mockClient, seed: false });
    expect(res).toBeDefined();
    expect(res.pool).toBe(mockPool);
  });
});

describeIntegration('testing/setup (integration)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('runs migrations and seeds against a live database idempotently', async () => {
    const client = await pool.connect();
    try {
      const { seeded } = await setupTestDatabase({ client, pool, seed: true });
      expect(seeded).toBeDefined();
      expect(seeded?.eco.name).toBe('EcoDAO');
      expect(seeded?.agri.name).toBe('AgriCoop');

      const { rows } = await client.query<{ name: string }>(
        'SELECT name FROM communities WHERE name IN ($1, $2)',
        ['EcoDAO', 'AgriCoop']
      );
      expect(rows.length).toBe(2);

      // Idempotency: second run succeeds without error
      await expect(setupTestDatabase({ client, pool, seed: true })).resolves.toBeDefined();
    } finally {
      client.release();
    }
  });
});
