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

/**
 * Environment variables required only in production (NODE_ENV=production).
 * These guard against accidental misconfiguration that could lead to
 * security vulnerabilities or data loss (e.g., Mainnet transactions in a dev environment).
 */
const PRODUCTION_REQUIRED_ENV_VARS = [
  'AUTH_SESSION_SECRET',
  'ADMIN_ADDRESSES',
] as const;

/**
 * Network-specific configuration validation for Mainnet.
 * Ensures Mainnet deployments have explicit, non-placeholder values.
 */
function validateMainnetConfig(): void {
  const network = process.env.STELLAR_NETWORK?.toLowerCase();
  if (network !== 'mainnet') {
    return; // Only validate if on Mainnet
  }

  // Mainnet-specific checks
  const issues: string[] = [];

  // Warn if critical secrets are still at placeholder values
  if (!process.env.AUTH_SESSION_SECRET || process.env.AUTH_SESSION_SECRET === 'changeme') {
    issues.push('AUTH_SESSION_SECRET is not set or is a placeholder (security risk on Mainnet)');
  }

  if (!process.env.ADMIN_ADDRESSES || process.env.ADMIN_ADDRESSES.trim() === '') {
    issues.push('ADMIN_ADDRESSES is empty; all operator routes will be blocked');
  }

  if (issues.length > 0) {
    logger.warn('⚠️ Mainnet configuration warnings:', { issues });
  }
}

function validateEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const missing: string[] = [];

  // Check required environment variables (all environments)
  REQUIRED_ENV_VARS.forEach((key) => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });

  // Check production-required environment variables
  if (nodeEnv === 'production') {
    PRODUCTION_REQUIRED_ENV_VARS.forEach((key) => {
      if (!process.env[key]) {
        missing.push(key);
      }
    });
  }

  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Validate Stellar network selection
  const network = process.env.STELLAR_NETWORK?.toLowerCase();
  if (!network || !['testnet', 'mainnet'].includes(network)) {
    logger.error(
      `Invalid STELLAR_NETWORK: "${network}". Must be "testnet" or "mainnet".`
    );
    process.exit(1);
  }

  logger.info(`Stellar network: ${network}`);

  // Mainnet-specific validation
  validateMainnetConfig();
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
  // switch drops nothing, then close the database pool. The timer is a backstop
  // below the compose stop_grace_period (30s) so a hung connection cannot block
  // the stop.
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received, starting graceful shutdown`);
    const forceExit = setTimeout(() => {
      logger.warn('Drain timed out; exiting');
      process.exit(1);
    }, 25_000);
    forceExit.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => (err ? reject(err) : resolve()));
        server.closeIdleConnections();
      });
      logger.info('HTTP server closed');

      await db.end();
      logger.info('Database pool closed');

      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      clearTimeout(forceExit);
      logger.error('Error during graceful shutdown', err);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
