/**
 * Graceful shutdown — SIGTERM/SIGINT drain the HTTP server, then close the DB pool.
 * Issue #383. Exercises the real handlers registered by src/index.ts.
 */

type Handler = () => void;

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('Graceful shutdown', () => {
  const ENV = {
    DATABASE_URL: 'postgresql://test',
    STELLAR_NETWORK: 'testnet',
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    FRONTEND_URL: 'http://localhost:3000',
  };

  let handlers: Record<string, Handler[]>;
  let server: { close: jest.Mock; closeIdleConnections: jest.Mock };
  let db: { connect: jest.Mock; end: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let exitSpy: jest.SpyInstance;
  let onSpy: jest.SpyInstance;
  const savedEnv = { ...process.env };

  async function start(closeError?: Error): Promise<void> {
    server = {
      close: jest.fn((cb: (err?: Error) => void) => setImmediate(() => cb(closeError))),
      closeIdleConnections: jest.fn(),
    };
    db = {
      connect: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined),
    };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    jest.doMock('dotenv/config', () => ({}));
    jest.doMock('../app', () => ({
      __esModule: true,
      default: { listen: jest.fn((_port: unknown, cb?: () => void) => (cb?.(), server)) },
    }));
    jest.doMock('../db', () => ({ db }));
    jest.doMock('../utils/logger', () => ({ logger }));

    jest.isolateModules(() => {
      require('../index');
    });
    await flush();
  }

  function emit(signal: string): void {
    for (const handler of handlers[signal] ?? []) handler();
  }

  beforeEach(() => {
    jest.resetModules();
    Object.assign(process.env, ENV);
    handlers = {};
    onSpy = jest.spyOn(process, 'on').mockImplementation(((event: string, handler: Handler) => {
      (handlers[event] ??= []).push(handler);
      return process;
    }) as typeof process.on);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    onSpy.mockRestore();
    exitSpy.mockRestore();
    process.env = { ...savedEnv };
  });

  it('registers exactly one handler per signal', async () => {
    await start();
    expect(handlers.SIGTERM).toHaveLength(1);
    expect(handlers.SIGINT).toHaveLength(1);
  });

  it('closes the server, then the database pool, then exits 0 on SIGTERM', async () => {
    await start();
    emit('SIGTERM');
    await flush();
    await flush();

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalled();
    expect(db.end).toHaveBeenCalledTimes(1);
    const messages = logger.info.mock.calls.map((call) => call[0] as string);
    expect(messages.indexOf('Database pool closed')).toBeGreaterThan(
      messages.indexOf('HTTP server closed')
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('handles SIGINT the same way', async () => {
    await start();
    emit('SIGINT');
    await flush();
    await flush();

    expect(db.end).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 and skips the pool when the server fails to close', async () => {
    const closeError = new Error('Server close failed');
    await start(closeError);
    emit('SIGTERM');
    await flush();

    expect(logger.error).toHaveBeenCalledWith('Error during graceful shutdown', closeError);
    expect(db.end).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 when closing the database pool fails', async () => {
    await start();
    const dbError = new Error('DB pool close failed');
    db.end.mockRejectedValueOnce(dbError);
    emit('SIGTERM');
    await flush();
    await flush();

    expect(logger.error).toHaveBeenCalledWith('Error during graceful shutdown', dbError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('only shuts down once when signals repeat', async () => {
    await start();
    emit('SIGTERM');
    emit('SIGTERM');
    emit('SIGINT');
    await flush();
    await flush();

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(db.end).toHaveBeenCalledTimes(1);
  });
});
