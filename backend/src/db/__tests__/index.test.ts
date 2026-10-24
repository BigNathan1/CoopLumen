/**
 * Unit tests for db/index.ts query() and transaction() helpers
 * Issue #377 - Tests the database wrapper functions with mocked pg Pool
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../../utils/logger';

// Mock the logger before importing db
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock pg Pool
jest.mock('pg', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue(mockClient),
    end: jest.fn(),
    on: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mockPool),
  };
});

describe('db helpers', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a fresh mock pool for each test
    mockPool = new Pool() as jest.Mocked<Pool>;
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);

    // Clear the module cache to get a fresh db instance
    jest.resetModules();
  });

  describe('query()', () => {
    it('executes a query and returns rows', async () => {
      const { db } = require('../index');
      const mockRows = [{ id: 1, name: 'Test' }];
      const mockResult: QueryResult = {
        rows: mockRows,
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await db.query('SELECT * FROM test WHERE id = $1', [1]);

      expect(result).toEqual(mockRows);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
      expect(logger.info).toHaveBeenCalledWith('Query executed', expect.objectContaining({
        duration: expect.any(Number),
        rows: 1,
      }));
    });

    it('executes a query without parameters', async () => {
      const { db } = require('../index');
      const mockResult: QueryResult = {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await db.query('SELECT * FROM test');

      expect(result).toEqual([]);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', undefined);
    });

    it('logs query duration', async () => {
      const { db } = require('../index');
      const mockResult: QueryResult = {
        rows: [{ id: 1 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      await db.query('SELECT 1');

      expect(logger.info).toHaveBeenCalledWith('Query executed', {
        duration: expect.any(Number),
        rows: 1,
      });
      const logCall = (logger.info as jest.Mock).mock.calls[0];
      expect(logCall[1].duration).toBeGreaterThanOrEqual(0);
    });

    it('propagates query errors', async () => {
      const { db } = require('../index');
      const error = new Error('Connection failed');
      (mockPool.query as jest.Mock).mockRejectedValue(error);

      await expect(db.query('SELECT * FROM test')).rejects.toThrow('Connection failed');
    });

    it('returns typed results', async () => {
      const { db } = require('../index');
      interface User {
        id: number;
        name: string;
      }
      const mockResult: QueryResult<User> = {
        rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await db.query<User>('SELECT * FROM users');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[0].name).toBe('Alice');
    });
  });

  describe('transaction()', () => {
    it('commits a successful transaction', async () => {
      const { db } = require('../index');
      const mockResult = { success: true };
      
      const result = await db.transaction(async (client: PoolClient) => {
        return mockResult;
      });

      expect(result).toEqual(mockResult);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('rolls back a failed transaction', async () => {
      const { db } = require('../index');
      const error = new Error('Transaction failed');

      await expect(db.transaction(async (client: PoolClient) => {
        throw error;
      })).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('releases the client even when BEGIN fails', async () => {
      const { db } = require('../index');
      const error = new Error('BEGIN failed');
      (mockClient.query as jest.Mock).mockRejectedValueOnce(error);

      await expect(db.transaction(async (client: PoolClient) => {
        return 'should not reach here';
      })).rejects.toThrow('BEGIN failed');

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('releases the client even when COMMIT fails', async () => {
      const { db } = require('../index');
      const error = new Error('COMMIT failed');
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(error); // COMMIT

      await expect(db.transaction(async (client: PoolClient) => {
        return 'done';
      })).rejects.toThrow('COMMIT failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('releases the client even when ROLLBACK fails', async () => {
      const { db } = require('../index');
      const txError = new Error('Transaction error');
      const rollbackError = new Error('ROLLBACK failed');
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(rollbackError); // ROLLBACK

      await expect(db.transaction(async (client: PoolClient) => {
        throw txError;
      })).rejects.toThrow('Transaction error');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('executes queries within the transaction context', async () => {
      const { db } = require('../index');
      const insertResult = { rows: [{ id: 1 }], rowCount: 1 };
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(insertResult) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await db.transaction(async (client: PoolClient) => {
        const res = await client.query('INSERT INTO test (name) VALUES ($1) RETURNING id', ['Test']);
        return res.rows[0].id;
      });

      expect(result).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO test (name) VALUES ($1) RETURNING id', ['Test']);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('supports nested queries in transaction', async () => {
      const { db } = require('../index');
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // First query
        .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // Second query
        .mockResolvedValueOnce(undefined); // COMMIT

      await db.transaction(async (client: PoolClient) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
        await client.query('SELECT COUNT(*) FROM users');
      });

      expect(mockClient.query).toHaveBeenCalledTimes(4); // BEGIN + 2 queries + COMMIT
    });

    it('returns typed results from transaction', async () => {
      const { db } = require('../index');
      interface Community {
        id: string;
        name: string;
      }
      const mockCommunity: Community = { id: 'abc-123', name: 'TestDAO' };
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockCommunity] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await db.transaction<Community>(async (client: PoolClient) => {
        const res = await client.query('INSERT INTO communities (name) VALUES ($1) RETURNING *', ['TestDAO']);
        return res.rows[0];
      });

      expect(result).toEqual(mockCommunity);
      expect(result.id).toBe('abc-123');
      expect(result.name).toBe('TestDAO');
    });
  });

  describe('connect()', () => {
    it('establishes a connection and logs success', async () => {
      const { db } = require('../index');

      await db.connect();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Database pool initialised', expect.objectContaining({
        maxConnections: expect.any(Number),
        idleTimeoutMs: expect.any(Number),
        connectionTimeoutMs: expect.any(Number),
      }));
    });

    it('propagates connection errors', async () => {
      const { db } = require('../index');
      const error = new Error('Connection refused');
      (mockPool.connect as jest.Mock).mockRejectedValue(error);

      await expect(db.connect()).rejects.toThrow('Connection refused');
    });
  });

  describe('ping()', () => {
    it('returns true when database is reachable', async () => {
      const { db } = require('../index');
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ '?column?': 1 }] });

      const result = await db.ping();

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns false when database is unreachable', async () => {
      const { db } = require('../index');
      (mockPool.query as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const result = await db.ping();

      expect(result).toBe(false);
    });
  });

  describe('end()', () => {
    it('drains the connection pool', async () => {
      const { db } = require('../index');

      await db.end();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('pool error handling', () => {
    it('registers an error handler on the pool', () => {
      // Import db to trigger pool initialization
      require('../index');

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('logs unexpected pool errors', () => {
      require('../index');

      const errorHandler = (mockPool.on as jest.Mock).mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      expect(errorHandler).toBeDefined();

      const error = new Error('Unexpected pool error');
      errorHandler(error);

      expect(logger.error).toHaveBeenCalledWith('Unexpected database pool error', error);
    });
  });
});
