/**
 * Tests for GET /api/v1/prices/xlm
 *
 * Strategy
 * --------
 * - The `https` module is fully mocked so no outbound network calls are made.
 * - The in-memory cache module is mocked so individual tests can control
 *   hit / miss behaviour without depending on wall-clock timing.
 * - Each provider is exercised both in isolation and as part of the waterfall.
 */

import request from 'supertest';
import https from 'https';
import { EventEmitter } from 'events';

// ── cache mock ───────────────────────────────────────────────────────────────
const mockGetCachedPrice = jest.fn();
const mockSetCachedPrice = jest.fn();

jest.mock('../../../cache/prices', () => ({
  getCachedPrice: (...args: unknown[]) => mockGetCachedPrice(...args),
  setCachedPrice: (...args: unknown[]) => mockSetCachedPrice(...args),
  invalidatePriceCache: jest.fn(),
  clearPriceCache: jest.fn(),
  XLM_PRICE_CACHE_KEY: 'price:xlm:usd',
  PRICE_CACHE_TTL_MS: 30_000,
}));

// ── other module mocks (required by app.ts transitive dependencies) ──────────
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
    isOpen: true,
  })),
}));

jest.mock('../../../db', () => ({
  db: {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    transaction: jest.fn(),
    ping: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// ── https mock ───────────────────────────────────────────────────────────────
jest.mock('https');
const mockHttpsGet = https.get as jest.Mock;

/**
 * Builds a minimal fake IncomingMessage + socket stub that the production
 * httpsGet helper can interact with.
 */
function makeFakeResponse(
  statusCode: number,
  _body: unknown
): { req: EventEmitter; res: EventEmitter } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number; setEncoding: jest.Mock };
  res.statusCode = statusCode;
  res.setEncoding = jest.fn();

  const req = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
  req.destroy = jest.fn((err?: Error) => {
    req.emit('error', err ?? new Error('destroyed'));
  });

  return { req, res };
}

/**
 * Registers a one-shot https.get mock that replies with `body` (serialised as
 * JSON) and the given status code.
 */
function mockHttpsResponse(statusCode: number, body: unknown): void {
  mockHttpsGet.mockImplementationOnce(
    (_url: string, _opts: unknown, callback: (res: EventEmitter) => void) => {
      const { req, res } = makeFakeResponse(statusCode, body);
      // Invoke the callback synchronously so tests can use async/await
      // directly without managing timers.
      setImmediate(() => {
        callback(res);
        res.emit('data', JSON.stringify(body));
        res.emit('end');
      });
      return req;
    }
  );
}

/**
 * Registers a one-shot https.get mock that emits a network error.
 */
function mockHttpsError(message: string): void {
  mockHttpsGet.mockImplementationOnce(
    (_url: string, _opts: unknown, _callback: unknown) => {
      const req = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
      req.destroy = jest.fn();
      setImmediate(() => req.emit('error', new Error(message)));
      return req;
    }
  );
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const COINGECKO_RESPONSE = { stellar: { usd: 0.12 } };
const COINBASE_RESPONSE = { data: { currency: 'XLM', rates: { USD: '0.13' } } };
const BINANCE_RESPONSE = { symbol: 'XLMUSDT', price: '0.14' };
const KRAKEN_RESPONSE = { error: [], result: { XXLMZUSD: { c: ['0.15', '1000'] } } };

// ─────────────────────────────────────────────────────────────────────────────

import app from '../../../app';

describe('GET /api/v1/prices/xlm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: cache miss
    mockGetCachedPrice.mockReturnValue(null);
    // Default setCachedPrice returns a plausible entry
    mockSetCachedPrice.mockImplementation((key: string, price: number, source: string) => ({
      price,
      source,
      cached_at: '2026-08-29T10:00:00.000Z',
      storedAtMs: Date.now(),
    }));
  });

  // ── cache hit ──────────────────────────────────────────────────────────────

  describe('cache hit', () => {
    it('returns the cached price without calling any provider', async () => {
      mockGetCachedPrice.mockReturnValue({
        price: 0.11,
        source: 'CoinGecko',
        cached_at: '2026-08-29T09:59:00.000Z',
        storedAtMs: Date.now(),
      });

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          asset: 'XLM',
          currency: 'USD',
          price: 0.11,
          source: 'CoinGecko',
          cached_at: '2026-08-29T09:59:00.000Z',
        },
      });
      expect(mockHttpsGet).not.toHaveBeenCalled();
      expect(mockSetCachedPrice).not.toHaveBeenCalled();
    });
  });

  // ── provider: CoinGecko ───────────────────────────────────────────────────

  describe('CoinGecko (provider 1)', () => {
    it('returns a 200 with price from CoinGecko on the first attempt', async () => {
      mockHttpsResponse(200, COINGECKO_RESPONSE);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        asset: 'XLM',
        currency: 'USD',
        price: 0.12,
        source: 'CoinGecko',
      });
      expect(typeof response.body.data.cached_at).toBe('string');
      expect(mockSetCachedPrice).toHaveBeenCalledWith('price:xlm:usd', 0.12, 'CoinGecko');
      // Only one HTTPS request needed
      expect(mockHttpsGet).toHaveBeenCalledTimes(1);
    });
  });

  // ── provider: Coinbase ────────────────────────────────────────────────────

  describe('Coinbase (provider 2)', () => {
    it('falls back to Coinbase when CoinGecko fails', async () => {
      mockHttpsError('CoinGecko unavailable');
      mockHttpsResponse(200, COINBASE_RESPONSE);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        price: 0.13,
        source: 'Coinbase',
      });
      expect(mockHttpsGet).toHaveBeenCalledTimes(2);
    });

    it('falls back to Coinbase when CoinGecko returns a bad shape', async () => {
      mockHttpsResponse(200, { stellar: { usd: 'not-a-number' } });
      mockHttpsResponse(200, COINBASE_RESPONSE);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data.source).toBe('Coinbase');
    });
  });

  // ── provider: Binance ─────────────────────────────────────────────────────

  describe('Binance (provider 3)', () => {
    it('falls back to Binance when CoinGecko and Coinbase fail', async () => {
      mockHttpsError('CoinGecko network error');
      mockHttpsError('Coinbase network error');
      mockHttpsResponse(200, BINANCE_RESPONSE);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        price: 0.14,
        source: 'Binance',
      });
      expect(mockHttpsGet).toHaveBeenCalledTimes(3);
    });

    it('falls back to Binance when Coinbase returns an HTTP error status', async () => {
      mockHttpsError('CoinGecko error');
      mockHttpsResponse(429, {});
      mockHttpsResponse(200, BINANCE_RESPONSE);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data.source).toBe('Binance');
    });
  });

  // ── provider: Kraken ──────────────────────────────────────────────────────

  describe('Kraken (provider 4)', () => {
    it('falls back to Kraken when the first three providers all fail', async () => {
      mockHttpsError('CoinGecko error');
      mockHttpsError('Coinbase error');
      mockHttpsError('Binance error');
      mockHttpsResponse(200, KRAKEN_RESPONSE);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        price: 0.15,
        source: 'Kraken',
      });
      expect(mockHttpsGet).toHaveBeenCalledTimes(4);
    });

    it('parses the Kraken XLMUSD pair alias when XXLMZUSD is absent', async () => {
      mockHttpsError('CoinGecko error');
      mockHttpsError('Coinbase error');
      mockHttpsError('Binance error');
      mockHttpsResponse(200, {
        error: [],
        result: { XLMUSD: { c: ['0.155', '500'] } },
      });

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        price: 0.155,
        source: 'Kraken',
      });
    });
  });

  // ── all providers fail → 502 ──────────────────────────────────────────────

  describe('all providers fail', () => {
    it('returns 502 with an envelope-formatted error body', async () => {
      mockHttpsError('CoinGecko down');
      mockHttpsError('Coinbase down');
      mockHttpsError('Binance down');
      mockHttpsError('Kraken down');

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        data: null,
        error: 'Unable to fetch XLM price. All upstream providers are currently unavailable.',
      });
      expect(mockSetCachedPrice).not.toHaveBeenCalled();
      expect(mockHttpsGet).toHaveBeenCalledTimes(4);
    });

    it('does not leak provider error details in the response body', async () => {
      mockHttpsError('internal host: cache.prices.internal:6379');
      mockHttpsError('api_key=secret123 unauthorized');
      mockHttpsError('Binance down');
      mockHttpsError('Kraken down');

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(502);
      expect(response.text).not.toContain('cache.prices.internal');
      expect(response.text).not.toContain('api_key');
      expect(response.text).not.toContain('secret123');
    });
  });

  // ── response shape validation ─────────────────────────────────────────────

  describe('response shape', () => {
    it('always includes all required data fields', async () => {
      mockHttpsResponse(200, COINGECKO_RESPONSE);

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      const { data } = response.body as {
        data: {
          asset: unknown;
          currency: unknown;
          price: unknown;
          source: unknown;
          cached_at: unknown;
        };
      };
      expect(data.asset).toBe('XLM');
      expect(data.currency).toBe('USD');
      expect(typeof data.price).toBe('number');
      expect(typeof data.source).toBe('string');
      expect(typeof data.cached_at).toBe('string');
      // cached_at must be a valid ISO-8601 date-time
      expect(new Date(data.cached_at as string).toISOString()).toBe(data.cached_at);
    });

    it('populates the cache entry returned by setCachedPrice into the response', async () => {
      mockHttpsResponse(200, COINGECKO_RESPONSE);
      mockSetCachedPrice.mockReturnValue({
        price: 0.12,
        source: 'CoinGecko',
        cached_at: '2026-08-29T10:09:00.000Z',
        storedAtMs: Date.now(),
      });

      const response = await request(app).get('/api/v1/prices/xlm');

      expect(response.status).toBe(200);
      expect(response.body.data.cached_at).toBe('2026-08-29T10:09:00.000Z');
    });
  });

  // ── cache is populated after a live fetch ─────────────────────────────────

  describe('cache population', () => {
    it('calls setCachedPrice with the correct key, price, and source on success', async () => {
      // CoinGecko fails, Coinbase fails, Binance succeeds → cache populated with Binance
      mockHttpsError('CoinGecko error');
      mockHttpsError('Coinbase error');
      mockHttpsResponse(200, BINANCE_RESPONSE);

      await request(app).get('/api/v1/prices/xlm');

      expect(mockSetCachedPrice).toHaveBeenCalledTimes(1);
      expect(mockSetCachedPrice).toHaveBeenCalledWith('price:xlm:usd', 0.14, 'Binance');
    });

    it('does not call setCachedPrice when all providers fail', async () => {
      mockHttpsError('e1');
      mockHttpsError('e2');
      mockHttpsError('e3');
      mockHttpsError('e4');

      await request(app).get('/api/v1/prices/xlm');

      expect(mockSetCachedPrice).not.toHaveBeenCalled();
    });
  });
});
