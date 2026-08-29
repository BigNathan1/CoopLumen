/**
 * In-memory price cache with TTL.
 *
 * Intentionally does not depend on Redis so that the prices endpoint is
 * fully functional in environments where REDIS_URL is not configured.
 * The default TTL is 30 seconds — short enough to stay reasonably fresh
 * while dramatically reducing outbound calls to public price APIs.
 */

export interface CachedPrice {
  /** USD price of the asset. */
  price: number;
  /** Which provider returned this quote (e.g. "CoinGecko"). */
  source: string;
  /** ISO-8601 timestamp of when the entry was stored. */
  cached_at: string;
  /** Unix-ms timestamp used for TTL arithmetic (not exposed to callers). */
  readonly storedAtMs: number;
}

const cache = new Map<string, CachedPrice>();

export const PRICE_CACHE_TTL_MS = 30_000;

/**
 * Returns the cached price entry for `key`, or `null` if the entry is absent
 * or has exceeded its TTL.
 */
export function getCachedPrice(key: string): CachedPrice | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.storedAtMs > PRICE_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry;
}

/**
 * Stores a price entry under `key`.  The `cached_at` field is set to the
 * current UTC instant so consumers can include it in API responses.
 */
export function setCachedPrice(
  key: string,
  price: number,
  source: string
): CachedPrice {
  const storedAtMs = Date.now();
  const entry: CachedPrice = {
    price,
    source,
    cached_at: new Date(storedAtMs).toISOString(),
    storedAtMs,
  };
  cache.set(key, entry);
  return entry;
}

/** Removes an entry (used in tests). */
export function invalidatePriceCache(key: string): void {
  cache.delete(key);
}

/** Clears the entire cache (used in tests). */
export function clearPriceCache(): void {
  cache.clear();
}

export const XLM_PRICE_CACHE_KEY = 'price:xlm:usd';
