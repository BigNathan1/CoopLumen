import 'dotenv/config';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { seedBaselineData } from '../db/seed-data';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const { eco, agri } = await seedBaselineData(client);
    logger.info('Communities seeded', { ecoId: eco.id, agriId: agri.id });
  } catch (error) {
    logger.error('Seed failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    logger.info('Database connection closed.');
  }
}

if (require.main === module) {
  logger.info('Seeding development database...');
  main()
    .then(() => logger.info('Seed complete'))
    .catch((error) => {
      logger.error('Seed runner failed', error);
      process.exitCode = 1;
    });
}
