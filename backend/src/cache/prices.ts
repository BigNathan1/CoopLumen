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

/** First cache tier: a process-local map of key -> [value, expiresAtMs]. */
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

/**
 * Reads a cached price, memory tier first, then Redis. A payload that is not
 * a well-formed price result is discarded rather than returned, so one bad
 * write cannot keep serving nonsense until its TTL expires.
 */
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
    const record = parsed as Record<string, unknown>;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof record.price !== 'string' ||
      typeof record.currency !== 'string'
    ) {
      logger.warn('Discarding malformed cached price payload', { key });
      await redisCache.del(key);
      return null;
    }
    const value = parsed as XlmPriceResult;
    // Warm the memory tier from Redis so the next read costs nothing.
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

/** Writes a price result to both cache tiers under its asset/currency key. */
export async function cachePrice(
  asset: string,
  currency: string,
  priceData: XlmPriceResult
): Promise<void> {
  const key = getPriceCacheKey(asset, currency);
  memorySet(key, priceData, PRICE_CACHE_TTL_SECONDS);
  await redisCache.setEx(key, PRICE_CACHE_TTL_SECONDS, JSON.stringify(priceData));
}
