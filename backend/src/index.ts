import 'dotenv/config';
import app from './app';
import { logger } from './utils/logger';
import { db } from './db';

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'STELLAR_NETWORK',
  'STELLAR_HORIZON_URL',
  'FRONTEND_URL',
] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT ?? 4000;

async function main(): Promise<void> {
  validateEnv();

  await db.connect();
  logger.info('Database connected');

  app.listen(PORT, () => {
    logger.info(`CoopLumen API running on port ${PORT}`);
  });
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
