import { Horizon } from '@stellar/stellar-sdk';
import { redisCache } from './redis';
import { logger } from '../utils/logger';

export const BALANCE_CACHE_TTL_SECONDS = 5;

export function getBalanceCacheKey(publicKey: string): string {
  return `balances:${publicKey}`;
}

export async function getCachedBalances(
  publicKey: string
): Promise<Horizon.HorizonApi.BalanceLine[] | null> {
  const key = getBalanceCacheKey(publicKey);
  const cached = await redisCache.get(key);

  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached) as unknown;
    if (!Array.isArray(parsed)) {
      logger.warn('Discarding malformed cached balance payload', { key });
      await redisCache.del(key);
      return null;
    }

    return parsed as Horizon.HorizonApi.BalanceLine[];
  } catch (error) {
    logger.warn('Discarding unreadable cached balance payload', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    await redisCache.del(key);
    return null;
  }
}

export async function cacheBalances(
  publicKey: string,
  balances: Horizon.HorizonApi.BalanceLine[]
): Promise<void> {
  await redisCache.setEx(
    getBalanceCacheKey(publicKey),
    BALANCE_CACHE_TTL_SECONDS,
    JSON.stringify(balances)
  );
}

export async function invalidateBalanceCache(publicKeys: Array<string | undefined>): Promise<void> {
  const uniquePublicKeys = [
    ...new Set(publicKeys.filter((value): value is string => Boolean(value))),
  ];

  await Promise.all(
    uniquePublicKeys.map((publicKey) => redisCache.del(getBalanceCacheKey(publicKey)))
  );
}
