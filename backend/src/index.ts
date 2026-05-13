import 'dotenv/config';
import app from './app';
import { logger } from './utils/logger';
import { db } from './db';

const PORT = process.env.PORT ?? 4000;

async function main(): Promise<void> {
  await db.connect();
  logger.info('Database connected');

  app.listen(PORT, () => {
    logger.info(`StellarCommons API running on port ${PORT}`);
  });
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
