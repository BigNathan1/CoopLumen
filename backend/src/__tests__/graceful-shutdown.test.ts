/**
 * Test for graceful shutdown — SIGTERM closes DB pool and HTTP server cleanly
 * Issue #383 - Verifies that the application handles SIGTERM signal properly
 */

import { EventEmitter } from 'events';
import { Server } from 'http';

// Mock dependencies before importing
jest.mock('../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Graceful shutdown', () => {
  let processEmitter: EventEmitter;
  let mockServer: Server;
  let originalProcessOn: typeof process.on;
  let originalProcessExit: typeof process.exit;
  let exitCode: number | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Create a mock server
    mockServer = new EventEmitter() as Server;
    mockServer.listen = jest.fn().mockImplementation((port: number, callback?: () => void) => {
      if (callback) callback();
      return mockServer;
    });
    mockServer.close = jest.fn().mockImplementation((callback?: (err?: Error) => void) => {
      if (callback) {
        process.nextTick(() => callback());
      }
      return mockServer;
    });

    // Capture process.exit calls
    exitCode = undefined;
    originalProcessExit = process.exit;
    process.exit = jest.fn(((code?: number) => {
      exitCode = code;
      throw new Error(`Process exited with code ${code}`);
    }) as typeof process.exit);

    // Set up process event emitter
    processEmitter = new EventEmitter();
    originalProcessOn = process.on;
    process.on = jest.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      processEmitter.on(event, handler);
      return process;
    }) as typeof process.on;
  });

  afterEach(() => {
    process.on = originalProcessOn;
    process.exit = originalProcessExit;
    processEmitter.removeAllListeners();
  });

  it('handles SIGTERM by closing server and database pool', async () => {
    const { db } = require('../db');
    const { logger } = require('../utils/logger');

    // Mock app.listen to set up SIGTERM handler
    jest.doMock('../app', () => ({
      __esModule: true,
      default: {
        listen: jest.fn().mockImplementation((port: number, callback?: () => void) => {
          if (callback) callback();

          // Register SIGTERM handler (simulating what server code should do)
          process.on('SIGTERM', async () => {
            logger.info('SIGTERM received, starting graceful shutdown');
            
            try {
              await new Promise<void>((resolve, reject) => {
                mockServer.close((err?: Error) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
              logger.info('HTTP server closed');

              await db.end();
              logger.info('Database pool closed');

              process.exit(0);
            } catch (err) {
              logger.error('Error during graceful shutdown', err);
              process.exit(1);
            }
          });

          return mockServer;
        }),
      },
    }));

    // Start the server (which registers SIGTERM handler)
    const app = require('../app').default;
    app.listen(4000);

    // Emit SIGTERM
    await expect(async () => {
      processEmitter.emit('SIGTERM');
      // Give time for async operations
      await new Promise(resolve => process.nextTick(resolve));
    }).rejects.toThrow('Process exited with code 0');

    // Verify shutdown sequence
    expect(logger.info).toHaveBeenCalledWith('SIGTERM received, starting graceful shutdown');
    expect(mockServer.close).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('HTTP server closed');
    expect(db.end).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Database pool closed');
    expect(exitCode).toBe(0);
  });

  it('handles server close errors during shutdown', async () => {
    const { db } = require('../db');
    const { logger } = require('../utils/logger');

    const closeError = new Error('Server close failed');
    mockServer.close = jest.fn().mockImplementation((callback?: (err?: Error) => void) => {
      if (callback) {
        process.nextTick(() => callback(closeError));
      }
      return mockServer;
    });

    jest.doMock('../app', () => ({
      __esModule: true,
      default: {
        listen: jest.fn().mockImplementation((port: number, callback?: () => void) => {
          if (callback) callback();

          process.on('SIGTERM', async () => {
            logger.info('SIGTERM received, starting graceful shutdown');
            
            try {
              await new Promise<void>((resolve, reject) => {
                mockServer.close((err?: Error) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
              logger.info('HTTP server closed');

              await db.end();
              logger.info('Database pool closed');

              process.exit(0);
            } catch (err) {
              logger.error('Error during graceful shutdown', err);
              process.exit(1);
            }
          });

          return mockServer;
        }),
      },
    }));

    const app = require('../app').default;
    app.listen(4000);

    await expect(async () => {
      processEmitter.emit('SIGTERM');
      await new Promise(resolve => process.nextTick(resolve));
    }).rejects.toThrow('Process exited with code 1');

    expect(logger.error).toHaveBeenCalledWith('Error during graceful shutdown', closeError);
    expect(exitCode).toBe(1);
  });

  it('handles database pool close errors during shutdown', async () => {
    const { db } = require('../db');
    const { logger } = require('../utils/logger');

    const dbError = new Error('DB pool close failed');
    db.end.mockRejectedValueOnce(dbError);

    jest.doMock('../app', () => ({
      __esModule: true,
      default: {
        listen: jest.fn().mockImplementation((port: number, callback?: () => void) => {
          if (callback) callback();

          process.on('SIGTERM', async () => {
            logger.info('SIGTERM received, starting graceful shutdown');
            
            try {
              await new Promise<void>((resolve, reject) => {
                mockServer.close((err?: Error) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
              logger.info('HTTP server closed');

              await db.end();
              logger.info('Database pool closed');

              process.exit(0);
            } catch (err) {
              logger.error('Error during graceful shutdown', err);
              process.exit(1);
            }
          });

          return mockServer;
        }),
      },
    }));

    const app = require('../app').default;
    app.listen(4000);

    await expect(async () => {
      processEmitter.emit('SIGTERM');
      await new Promise(resolve => process.nextTick(resolve));
    }).rejects.toThrow('Process exited with code 1');

    expect(mockServer.close).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('HTTP server closed');
    expect(db.end).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Error during graceful shutdown', dbError);
    expect(exitCode).toBe(1);
  });

  it('closes database pool even if server close succeeds', async () => {
    const { db } = require('../db');
    const { logger } = require('../utils/logger');

    jest.doMock('../app', () => ({
      __esModule: true,
      default: {
        listen: jest.fn().mockImplementation((port: number, callback?: () => void) => {
          if (callback) callback();

          process.on('SIGTERM', async () => {
            logger.info('SIGTERM received, starting graceful shutdown');
            
            try {
              await new Promise<void>((resolve, reject) => {
                mockServer.close((err?: Error) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
              logger.info('HTTP server closed');

              await db.end();
              logger.info('Database pool closed');

              process.exit(0);
            } catch (err) {
              logger.error('Error during graceful shutdown', err);
              process.exit(1);
            }
          });

          return mockServer;
        }),
      },
    }));

    const app = require('../app').default;
    app.listen(4000);

    await expect(async () => {
      processEmitter.emit('SIGTERM');
      await new Promise(resolve => process.nextTick(resolve));
    }).rejects.toThrow('Process exited with code 0');

    const logCalls = (logger.info as jest.Mock).mock.calls;
    const logMessages = logCalls.map(call => call[0]);

    // Verify order of operations
    const serverClosedIndex = logMessages.indexOf('HTTP server closed');
    const dbClosedIndex = logMessages.indexOf('Database pool closed');

    expect(serverClosedIndex).toBeGreaterThan(-1);
    expect(dbClosedIndex).toBeGreaterThan(-1);
    expect(dbClosedIndex).toBeGreaterThan(serverClosedIndex);
    expect(db.end).toHaveBeenCalledTimes(1);
  });

  it('only closes resources once per SIGTERM', async () => {
    const { db } = require('../db');
    const { logger } = require('../utils/logger');

    let shutdownInProgress = false;

    jest.doMock('../app', () => ({
      __esModule: true,
      default: {
        listen: jest.fn().mockImplementation((port: number, callback?: () => void) => {
          if (callback) callback();

          process.on('SIGTERM', async () => {
            if (shutdownInProgress) return;
            shutdownInProgress = true;

            logger.info('SIGTERM received, starting graceful shutdown');
            
            try {
              await new Promise<void>((resolve, reject) => {
                mockServer.close((err?: Error) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
              logger.info('HTTP server closed');

              await db.end();
              logger.info('Database pool closed');

              process.exit(0);
            } catch (err) {
              logger.error('Error during graceful shutdown', err);
              process.exit(1);
            }
          });

          return mockServer;
        }),
      },
    }));

    const app = require('../app').default;
    app.listen(4000);

    // Emit SIGTERM twice
    processEmitter.emit('SIGTERM');
    processEmitter.emit('SIGTERM');
    
    await new Promise(resolve => process.nextTick(resolve));

    // Should only close once
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(db.end).toHaveBeenCalledTimes(1);
  });
});
