import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

// PostgreSQL connection pool configuration
// Environment variables with safe defaults for production readiness
const PGPOOL_MAX = parseInt(process.env.PGPOOL_MAX || '10', 10);
const PGPOOL_IDLE_TIMEOUT = parseInt(process.env.PGPOOL_IDLE_TIMEOUT || '30000', 10);
const PGPOOL_CONNECTION_TIMEOUT = parseInt(process.env.PGPOOL_CONNECTION_TIMEOUT || '2000', 10);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: PGPOOL_MAX,
  idleTimeoutMillis: PGPOOL_IDLE_TIMEOUT,
  connectionTimeoutMillis: PGPOOL_CONNECTION_TIMEOUT,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', err);
});

export const db = {
  async connect(): Promise<void> {
    const client = await pool.connect();
    client.release();
    logger.info('Database pool initialised', {
      maxConnections: PGPOOL_MAX,
      idleTimeoutMs: PGPOOL_IDLE_TIMEOUT,
      connectionTimeoutMs: PGPOOL_CONNECTION_TIMEOUT,
      environment: process.env.NODE_ENV || 'development',
    });
  },

  async query<T extends object>(text: string, params?: unknown[]): Promise<T[]> {
    const start = Date.now();
    const result = await pool.query<T>(text, params);
    logger.info('Query executed', {
      duration: Date.now() - start,
      rows: result.rowCount,
    });
    return result.rows;
  },

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async ping(): Promise<boolean> {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  },

  /** Drains the connection pool. Used by integration tests for clean teardown. */
  async end(): Promise<void> {
    await pool.end();
  },
};
