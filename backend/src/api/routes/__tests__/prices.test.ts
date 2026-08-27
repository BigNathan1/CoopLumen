import request from 'supertest';
import app from '../../../app';
import { PriceService } from '../../../contracts/prices';
import { clearPriceCache, cacheXlmPrice } from '../../../cache/prices';

jest.mock('../../../db', () => ({
  db: { ping: jest.fn().mockResolvedValue(true) },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Prices API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPriceCache();
  });

  describe('GET /api/v1/prices/xlm', () => {
    it('returns the current XLM/USD price from PriceService', async () => {
      const mockPrice = {
        asset: 'XLM' as const,
        currency: 'USD' as const,
        pair: 'XLM/USD' as const,
        price: '0.145200',
        source: 'coinbase',
        timestamp: '2026-08-27T17:00:00.000Z',
      };

      jest.spyOn(PriceService, 'getXlmPrice').mockResolvedValueOnce(mockPrice);

      const res = await request(app).get('/api/v1/prices/xlm');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: mockPrice,
      });
      expect(PriceService.getXlmPrice).toHaveBeenCalledTimes(1);
    });

    it('returns cached price if available without calling PriceService', async () => {
      const cachedPrice = {
        asset: 'XLM' as const,
        currency: 'USD' as const,
        pair: 'XLM/USD' as const,
        price: '0.146000',
        source: 'coingecko',
        timestamp: '2026-08-27T16:59:00.000Z',
      };

      await cacheXlmPrice(cachedPrice);
      const getXlmPriceSpy = jest.spyOn(PriceService, 'getXlmPrice');

      const res = await request(app).get('/api/v1/prices/xlm');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: cachedPrice,
      });
      expect(getXlmPriceSpy).not.toHaveBeenCalled();
    });

    it('accepts valid currency=USD query parameter', async () => {
      const mockPrice = {
        asset: 'XLM' as const,
        currency: 'USD' as const,
        pair: 'XLM/USD' as const,
        price: '0.145500',
        source: 'coinbase',
        timestamp: '2026-08-27T17:00:00.000Z',
      };

      jest.spyOn(PriceService, 'getXlmPrice').mockResolvedValueOnce(mockPrice);

      const res = await request(app).get('/api/v1/prices/xlm?currency=USD');

      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe('0.145500');
    });

    it('rejects unsupported currency parameter with standard validation error envelope', async () => {
      const res = await request(app).get('/api/v1/prices/xlm?currency=EUR');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: [
            {
              path: 'currency',
              message: 'Currently only USD is supported as price currency',
            },
          ],
        },
      });
    });

    it('returns 502 error envelope when price lookup fails across all providers', async () => {
      jest
        .spyOn(PriceService, 'getXlmPrice')
        .mockRejectedValueOnce(new Error('All upstream providers failed'));

      const res = await request(app).get('/api/v1/prices/xlm');

      expect(res.status).toBe(502);
      expect(res.body).toEqual({
        data: null,
        error: 'Failed to fetch XLM price from public sources.',
      });
    });
  });

  describe('GET /api/v1/prices/:asset', () => {
    it('returns price for XLM with case insensitivity (e.g. /prices/XLM)', async () => {
      const mockPrice = {
        asset: 'XLM' as const,
        currency: 'USD' as const,
        pair: 'XLM/USD' as const,
        price: '0.145000',
        source: 'coinbase',
        timestamp: '2026-08-27T17:00:00.000Z',
      };

      jest.spyOn(PriceService, 'getXlmPrice').mockResolvedValueOnce(mockPrice);

      const res = await request(app).get('/api/v1/prices/XLM');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockPrice);
    });

    it('returns 400 validation error for unsupported asset parameter', async () => {
      const res = await request(app).get('/api/v1/prices/btc');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: [
            {
              path: 'asset',
              message: 'Currently only xlm price is supported',
            },
          ],
        },
      });
    });
  });
});
