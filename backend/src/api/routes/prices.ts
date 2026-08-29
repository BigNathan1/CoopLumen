/**
 * GET /api/v1/prices/xlm
 *
 * Returns the current XLM/USD spot price fetched from external providers,
 * served from an in-memory 30-second cache between provider calls.
 *
 * Provider waterfall (tried in order until one succeeds):
 *   1. CoinGecko  — /simple/price
 *   2. Coinbase   — /v2/exchange-rates
 *   3. Binance    — /api/v3/ticker/price
 *   4. Kraken     — /0/public/Ticker
 *
 * Response envelope:
 *   { data: { asset, currency, price, source, cached_at } }
 *
 * Errors follow the project envelope:
 *   { data: null, error: string }
 */

import { Router, Request, Response, NextFunction } from 'express';
import https from 'https';
import { getCachedPrice, setCachedPrice, XLM_PRICE_CACHE_KEY } from '../../cache/prices';
import { logger } from '../../utils/logger';

export const priceRouter = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceResult {
  price: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Low-level HTTP helper (no external deps beyond Node built-ins)
// ---------------------------------------------------------------------------

/**
 * Performs a GET request over HTTPS and resolves with the parsed JSON body.
 * Rejects with an `Error` if the status is non-2xx or the body is not valid
 * JSON.  Caller is responsible for interpreting the returned value.
 */
function httpsGet(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} from ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Non-JSON response from ${url}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out: ${url}`));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Individual provider fetch functions
// ---------------------------------------------------------------------------

async function fetchCoinGecko(): Promise<PriceResult> {
  const data = await httpsGet(
    'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd'
  );

  const price = (data as Record<string, Record<string, unknown>>)?.stellar?.usd;
  if (typeof price !== 'number' || price <= 0) {
    throw new Error('CoinGecko returned unexpected price shape');
  }
  return { price, source: 'CoinGecko' };
}

async function fetchCoinbase(): Promise<PriceResult> {
  const data = await httpsGet('https://api.coinbase.com/v2/exchange-rates?currency=XLM');

  const rate = (data as Record<string, Record<string, Record<string, string>>>)?.data?.rates?.USD;
  const price = parseFloat(rate ?? '');
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Coinbase returned unexpected rate shape');
  }
  return { price, source: 'Coinbase' };
}

async function fetchBinance(): Promise<PriceResult> {
  const data = await httpsGet('https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT');

  const raw = (data as Record<string, string>)?.price;
  const price = parseFloat(raw ?? '');
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Binance returned unexpected price shape');
  }
  return { price, source: 'Binance' };
}

async function fetchKraken(): Promise<PriceResult> {
  const data = await httpsGet('https://api.kraken.com/0/public/Ticker?pair=XLMUSD');

  // Kraken wraps results under data.result['XXLMZUSD'] or 'XLMUSD';
  // 'c' is the last trade closed array: [price, lot_volume]
  const result = (data as Record<string, Record<string, Record<string, string[]>>>)?.result;
  const pair = result?.['XXLMZUSD'] ?? result?.['XLMUSD'];
  const rawPrice = pair?.c?.[0];
  const price = parseFloat(rawPrice ?? '');
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Kraken returned unexpected ticker shape');
  }
  return { price, source: 'Kraken' };
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

const PROVIDERS: Array<() => Promise<PriceResult>> = [
  fetchCoinGecko,
  fetchCoinbase,
  fetchBinance,
  fetchKraken,
];

/**
 * Tries each provider in order.  Returns the first successful result.
 * Logs each provider failure at `warn` level before moving to the next.
 * Rejects (with an `AggregateError`-style message) if all providers fail.
 */
async function fetchXlmPrice(): Promise<PriceResult> {
  const errors: string[] = [];

  for (const fetch of PROVIDERS) {
    try {
      return await fetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      logger.warn('XLM price provider failed; trying next', { message });
    }
  }

  throw new Error(`All price providers failed: ${errors.join(' | ')}`);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/prices/xlm
 *
 * Returns the current XLM/USD price.  Hits the in-memory cache first; if
 * stale or absent, falls through the provider waterfall and re-populates
 * the cache on success.
 */
priceRouter.get('/xlm', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. In-memory cache hit
    const cached = getCachedPrice(XLM_PRICE_CACHE_KEY);
    if (cached) {
      res.json({
        data: {
          asset: 'XLM',
          currency: 'USD',
          price: cached.price,
          source: cached.source,
          cached_at: cached.cached_at,
        },
      });
      return;
    }

    // 2. Provider waterfall
    const result = await fetchXlmPrice();

    // 3. Populate cache
    const entry = setCachedPrice(XLM_PRICE_CACHE_KEY, result.price, result.source);

    res.json({
      data: {
        asset: 'XLM',
        currency: 'USD',
        price: entry.price,
        source: entry.source,
        cached_at: entry.cached_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch XLM price from all providers', { message });

    // Surface as a 502 so callers know this is an upstream problem, not a
    // client error.  The internal provider details are kept out of the
    // response body to avoid leaking infra topology.
    res.status(502).json({
      data: null,
      error: 'Unable to fetch XLM price. All upstream providers are currently unavailable.',
    });

    // Don't propagate to the global error handler — we've already sent a
    // structured response.
    void next;
  }
});
