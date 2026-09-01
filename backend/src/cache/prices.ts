import { redisCache } from './redis';
import { logger } from '../utils/logger';
import { XlmPriceResult } from '../services/prices';

export const PRICE_CACHE_TTL_SECONDS = 30;

/** Redis key for a given asset/currency pair. */
export function getPriceCacheKey(asset: string, currency: string): string {
  return `prices:${asset.toUpperCase()}:${currency.toUpperCase()}`;
}

/** Stable key for the default XLM/USD pair — exported so tests can reference it directly. */
export const PRICE_CACHE_KEY = getPriceCacheKey('XLM', 'USD');

// ---------------------------------------------------------------------------
// In-memory cache tier
// Each entry is a tuple of [value, expiresAtMs] so we can expire correctly.
// ---------------------------------------------------------------------------
const memoryCache = new Map<string, [XlmPriceResult, number]>();

function memoryGet(key: string): XlmPriceResult | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  const [value, expiresAt] = entry;
  if (Date.now() > expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return value;
}

function memorySet(key: string, value: XlmPriceResult, ttlSeconds: number): void {
  memoryCache.set(key, [value, Date.now() + ttlSeconds * 1000]);
}

function memoryDel(key: string): void {
  memoryCache.delete(key);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads the XLM price for the given currency from the two-tier cache.
 * Checks in-memory first (no I/O), then falls back to Redis.
 * Returns null on a full miss.
 */
export async function getCachedXlmPrice(currency = 'USD'): Promise<XlmPriceResult | null> {
  const key = getPriceCacheKey('XLM', currency);

  // Tier 1 — in-memory
  const mem = memoryGet(key);
  if (mem) return mem;

  // Tier 2 — Redis
  const raw = await redisCache.get(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).price !== 'string' ||
      typeof (parsed as Record<string, unknown>).currency !== 'string'
    ) {
      logger.warn('Discarding malformed cached price payload', { key });
      await redisCache.del(key);
      return null;
    }
    const value = parsed as XlmPriceResult;
    // Warm the memory tier from Redis so the next request is free.
    memorySet(key, value, PRICE_CACHE_TTL_SECONDS);
    return value;
  } catch (error) {
    logger.warn('Discarding unreadable cached price payload', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    await redisCache.del(key);
    return null;
  }
}

/**
 * Writes a price result to both the in-memory and Redis cache tiers.
 */
export async function cacheXlmPrice(price: XlmPriceResult): Promise<void> {
  const key = getPriceCacheKey(price.asset, price.currency);
  memorySet(key, price, PRICE_CACHE_TTL_SECONDS);
  await redisCache.setEx(key, PRICE_CACHE_TTL_SECONDS, JSON.stringify(price));
}

/**
 * Clears the in-memory (and optionally Redis) cache for the XLM/currency pair.
 * Primarily used in tests to force a fresh fetch.
 */
export async function clearPriceCache(currency = 'USD'): Promise<void> {
  const key = getPriceCacheKey('XLM', currency);
  memoryDel(key);
  await redisCache.del(key);
}

/**
 * Drops every in-process cache entry without touching Redis.
 *
 * Test teardown uses this: reaching for Redis there opens a real connection
 * (and under fake timers its connect promise never settles), which is what
 * stalled every `afterEach` in CI and then kept Jest alive after the run.
 */
export function clearPriceMemoryCache(): void {
  memoryCache.clear();
}

// ---------------------------------------------------------------------------
// Legacy helpers kept for backward compatibility with existing callers that
// use the generic getCachedPrice / cachePrice signatures.
// ---------------------------------------------------------------------------

export async function getCachedPrice(
  asset: string,
  currency: string
): Promise<XlmPriceResult | null> {
  const key = getPriceCacheKey(asset, currency);

  const mem = memoryGet(key);
  if (mem) return mem;

  const raw = await redisCache.get(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).price !== 'string'
    ) {
      await redisCache.del(key);
      return null;
    }
    const value = parsed as XlmPriceResult;
    memorySet(key, value, PRICE_CACHE_TTL_SECONDS);
    return value;
  } catch {
    await redisCache.del(key);
    return null;
  }
}

export async function cachePrice(
  asset: string,
  currency: string,
  priceData: XlmPriceResult
): Promise<void> {
  const key = getPriceCacheKey(asset, currency);
  memorySet(key, priceData, PRICE_CACHE_TTL_SECONDS);
  await redisCache.setEx(key, PRICE_CACHE_TTL_SECONDS, JSON.stringify(priceData));
}
