import {
  getCachedXlmPrice,
  cacheXlmPrice,
  clearPriceCache,
  PRICE_CACHE_KEY,
  PRICE_CACHE_TTL_SECONDS,
} from '../prices';
import { redisCache } from '../redis';
import { XlmPriceResult } from '../../services/prices';

jest.mock('../redis', () => ({
  redisCache: {
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
  },
}));

describe('cache/prices', () => {
  const samplePrice: XlmPriceResult = {
    asset: 'XLM',
    currency: 'USD',
    pair: 'XLM/USD',
    price: '0.145000',
    source: 'coinbase',
    timestamp: '2026-08-27T17:00:00.000Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await clearPriceCache();
  });

  it('returns null on cache miss', async () => {
    (redisCache.get as jest.Mock).mockResolvedValue(null);

    const result = await getCachedXlmPrice();
    expect(result).toBeNull();
    expect(redisCache.get).toHaveBeenCalledWith(PRICE_CACHE_KEY);
  });

  it('caches price to memory and redis', async () => {
    await cacheXlmPrice(samplePrice);

    expect(redisCache.setEx).toHaveBeenCalledWith(
      PRICE_CACHE_KEY,
      PRICE_CACHE_TTL_SECONDS,
      JSON.stringify(samplePrice)
    );

    // Reading back should hit memory cache without calling redis.get
    (redisCache.get as jest.Mock).mockClear();
    const result = await getCachedXlmPrice();
    expect(result).toEqual(samplePrice);
    expect(redisCache.get).not.toHaveBeenCalled();
  });

  it('populates memory cache when reading from Redis', async () => {
    (redisCache.get as jest.Mock).mockResolvedValue(JSON.stringify(samplePrice));

    const result = await getCachedXlmPrice();
    expect(result).toEqual(samplePrice);
    expect(redisCache.get).toHaveBeenCalledTimes(1);

    // Subsequent read hits memory cache
    const secondResult = await getCachedXlmPrice();
    expect(secondResult).toEqual(samplePrice);
    expect(redisCache.get).toHaveBeenCalledTimes(1);
  });

  it('discards malformed redis cache payloads and cleans key', async () => {
    (redisCache.get as jest.Mock).mockResolvedValue('{"invalid": true}');

    const result = await getCachedXlmPrice();
    expect(result).toBeNull();
    expect(redisCache.del).toHaveBeenCalledWith(PRICE_CACHE_KEY);
  });

  it('handles unparseable JSON from Redis gracefully', async () => {
    (redisCache.get as jest.Mock).mockResolvedValue('not-json{');

    const result = await getCachedXlmPrice();
    expect(result).toBeNull();
    expect(redisCache.del).toHaveBeenCalledWith(PRICE_CACHE_KEY);
  });
});
