import { redisCache } from './redis';
import { logger } from '../utils/logger';
import { XlmPriceResult } from '../contracts/prices';

export const PRICE_CACHE_TTL_SECONDS = 30;
export const PRICE_CACHE_KEY = 'price:xlm:usd';

let memoryCache: { data: XlmPriceResult; expiresAt: number } | null = null;

export async function getCachedXlmPrice(): Promise<XlmPriceResult | null> {
  if (memoryCache && Date.now() < memoryCache.expiresAt) {
    return memoryCache.data;
  }

  const cached = await redisCache.get(PRICE_CACHE_KEY);
  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('price' in parsed) ||
      !('asset' in parsed) ||
      !('currency' in parsed)
    ) {
      logger.warn('Discarding malformed cached price payload', { key: PRICE_CACHE_KEY });
      await redisCache.del(PRICE_CACHE_KEY);
      return null;
    }

    const result = parsed as XlmPriceResult;
    memoryCache = {
      data: result,
      expiresAt: Date.now() + PRICE_CACHE_TTL_SECONDS * 1000,
    };
    return result;
  } catch (error) {
    logger.warn('Discarding unreadable cached price payload', {
      key: PRICE_CACHE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
    await redisCache.del(PRICE_CACHE_KEY);
    return null;
  }
}

export async function cacheXlmPrice(price: XlmPriceResult): Promise<void> {
  memoryCache = {
    data: price,
    expiresAt: Date.now() + PRICE_CACHE_TTL_SECONDS * 1000,
  };

  await redisCache.setEx(PRICE_CACHE_KEY, PRICE_CACHE_TTL_SECONDS, JSON.stringify(price));
}

export function clearPriceCache(): void {
  memoryCache = null;
}
