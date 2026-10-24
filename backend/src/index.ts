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

let isShuttingDown = false;

async function main(): Promise<void> {
  validateEnv();

  await db.connect();
  logger.info('Database connected');

  const server = app.listen(PORT, () => {
    logger.info(`CoopLumen API running on port ${PORT}`);
  });

  // Blue/green deploys retire the old container with SIGTERM after traffic has
  // moved. Stop accepting connections but let in-flight requests finish, so the
  // switch drops nothing. The timer is a backstop below the compose
  // stop_grace_period (30s) so a hung connection cannot block the stop.
  const shutdown = (signal: string): void => {
    logger.info(`${signal} received; draining connections`);
    const forceExit = setTimeout(() => {
      logger.warn('Drain timed out; exiting');
      process.exit(1);
    }, 25_000);
    forceExit.unref();
    server.close(() => {
      process.exit(0);
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  // Graceful shutdown handler for SIGTERM
  process.on('SIGTERM', async () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info('SIGTERM received, starting graceful shutdown');

    try {
      // Close HTTP server first (stops accepting new connections)
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info('HTTP server closed');

      // Close database pool
      await db.end();
      logger.info('Database pool closed');

      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', err);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
