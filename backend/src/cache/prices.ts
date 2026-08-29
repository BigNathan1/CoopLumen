import { redisCache } from './redis';
import { logger } from '../utils/logger';
import { XlmPriceData } from '../contracts/prices';

export const PRICE_CACHE_TTL_SECONDS = 30;

export function getPriceCacheKey(asset: string, currency: string): string {
  return `prices:${asset.toUpperCase()}:${currency.toUpperCase()}`;
}

export async function getCachedPrice(
  asset: string,
  currency: string
): Promise<XlmPriceData | null> {
  const key = getPriceCacheKey(asset, currency);
  const cached = await redisCache.get(key);

  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached) as XlmPriceData;
    if (parsed && typeof parsed.price === 'string' && typeof parsed.currency === 'string') {
      return parsed;
    }
    await redisCache.del(key);
    return null;
  } catch (error) {
    logger.warn('Discarding malformed cached price payload', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    await redisCache.del(key);
    return null;
  }
}

export async function cachePrice(
  asset: string,
  currency: string,
  priceData: XlmPriceData
): Promise<void> {
  await redisCache.setEx(
    getPriceCacheKey(asset, currency),
    PRICE_CACHE_TTL_SECONDS,
    JSON.stringify(priceData)
  );
}
