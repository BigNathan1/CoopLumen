import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', err);
});

export const db = {
  async connect(): Promise<void> {
    const client = await pool.connect();
    client.release();
    logger.info('Database pool initialised');
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
