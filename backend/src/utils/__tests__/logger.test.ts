import { Writable } from 'node:stream';

type LoggerEnv = { NODE_ENV?: string; LOG_LEVEL?: string };

type LoadedLogger = {
  logger: typeof import('../logger').logger;
  lines: string[];
  defaultTransports: string[];
};

/**
 * `logger` reads NODE_ENV and LOG_LEVEL once, at import time, so each case
 * loads a fresh copy of the module under the environment it wants to test.
 * The Console transport is swapped for an in-memory stream so the formatted
 * output can be asserted on.
 */
function loadLogger(env: LoggerEnv): LoadedLogger {
  const previous = { NODE_ENV: process.env.NODE_ENV, LOG_LEVEL: process.env.LOG_LEVEL };
  for (const key of ['NODE_ENV', 'LOG_LEVEL'] as const) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const winston = require('winston') as typeof import('winston');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { logger } = require('../logger') as typeof import('../logger');

  for (const key of ['NODE_ENV', 'LOG_LEVEL'] as const) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }

  const defaultTransports = logger.transports.map((transport) => transport.constructor.name);
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback): void {
      lines.push(String(chunk));
      callback();
    },
  });
  logger.clear();
  logger.add(new winston.transports.Stream({ stream }));

  return { logger, lines, defaultTransports };
}

describe('logger', () => {
  afterEach(() => {
    jest.resetModules();
  });

  describe('configuration', () => {
    it('writes to the console by default', () => {
      expect(loadLogger({}).defaultTransports).toEqual(['Console']);
    });

    it('defaults to the info level when LOG_LEVEL is unset', () => {
      expect(loadLogger({}).logger.level).toBe('info');
    });

    it.each(['error', 'warn', 'debug'])('honours LOG_LEVEL=%s', (level) => {
      expect(loadLogger({ LOG_LEVEL: level }).logger.level).toBe(level);
    });
  });

  describe('level filtering', () => {
    it('drops messages below the configured level', () => {
      const { logger, lines } = loadLogger({ NODE_ENV: 'production' });
      logger.debug('too verbose');
      logger.info('kept');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!).message).toBe('kept');
    });

    it('emits debug messages once LOG_LEVEL=debug', () => {
      const { logger, lines } = loadLogger({ NODE_ENV: 'production', LOG_LEVEL: 'debug' });
      logger.debug('now visible');
      expect(JSON.parse(lines[0]!).level).toBe('debug');
    });

    it('only emits errors at LOG_LEVEL=error', () => {
      const { logger, lines } = loadLogger({ NODE_ENV: 'production', LOG_LEVEL: 'error' });
      logger.warn('ignored');
      logger.info('ignored');
      logger.error('reported');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!).level).toBe('error');
    });
  });

  describe('production format', () => {
    it('emits one JSON document per entry with level, message and an ISO timestamp', () => {
      const { logger, lines } = loadLogger({ NODE_ENV: 'production' });
      logger.info('community created', { communityId: 'c-1' });

      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]!);
      expect(entry).toMatchObject({
        level: 'info',
        message: 'community created',
        communityId: 'c-1',
      });
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });

    it('serialises an Error with its message and stack', () => {
      const { logger, lines } = loadLogger({ NODE_ENV: 'production' });
      logger.error(new Error('database unreachable'));

      const entry = JSON.parse(lines[0]!);
      expect(entry.level).toBe('error');
      expect(entry.message).toBe('database unreachable');
      expect(entry.stack).toEqual(expect.stringContaining('Error: database unreachable'));
    });

    it('keeps the stack of an Error passed as metadata', () => {
      const { logger, lines } = loadLogger({ NODE_ENV: 'production' });
      logger.error('request failed', new Error('boom'));

      const entry = JSON.parse(lines[0]!);
      expect(entry.message).toEqual(expect.stringContaining('request failed'));
      expect(entry.stack).toEqual(expect.stringContaining('Error: boom'));
    });
  });

  describe('non-production format', () => {
    it.each([{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }, {}])(
      'pretty-prints instead of emitting JSON (%j)',
      (env) => {
        const { logger, lines } = loadLogger(env);
        logger.info('hello', { answer: 42 });

        expect(lines).toHaveLength(1);
        expect(() => JSON.parse(lines[0]!)).toThrow();
        expect(lines[0]).toEqual(expect.stringContaining('hello'));
        expect(lines[0]).toEqual(expect.stringContaining('answer'));
        expect(lines[0]).toEqual(expect.stringContaining('timestamp'));
      }
    );
  });
});
