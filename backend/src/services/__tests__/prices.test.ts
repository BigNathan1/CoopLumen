import { PriceServiceClass } from '../prices';

describe('PriceService', () => {
  let priceService: PriceServiceClass;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    priceService = new PriceServiceClass();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches XLM price successfully from Coinbase', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          base: 'XLM',
          currency: 'USD',
          amount: '0.142500',
        },
      }),
    });

    const result = await priceService.getXlmPrice();

    expect(result).toEqual({
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: '0.142500',
      source: 'coinbase',
      timestamp: expect.any(String),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to CoinGecko when Coinbase fails', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          stellar: {
            usd: 0.1428,
          },
        }),
      });

    const result = await priceService.getXlmPrice();

    expect(result).toEqual({
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: '0.1428',
      source: 'coingecko',
      timestamp: expect.any(String),
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to Binance when Coinbase and CoinGecko fail', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Coinbase network timeout'))
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          symbol: 'XLMUSDT',
          price: '0.14310000',
        }),
      });

    const result = await priceService.getXlmPrice();

    expect(result).toEqual({
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: '0.14310000',
      source: 'binance',
      timestamp: expect.any(String),
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('falls back to Kraken when Coinbase, CoinGecko, and Binance fail', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Coinbase offline'))
      .mockRejectedValueOnce(new Error('CoinGecko rate limited'))
      .mockRejectedValueOnce(new Error('Binance 503'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          error: [],
          result: {
            XXLMZUSD: {
              c: ['0.142900', '500.0'],
            },
          },
        }),
      });

    const result = await priceService.getXlmPrice();

    expect(result).toEqual({
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: '0.142900',
      source: 'kraken',
      timestamp: expect.any(String),
    });
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('throws an error when all public providers fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

    await expect(priceService.getXlmPrice()).rejects.toThrow(
      'Failed to fetch XLM price from all public sources'
    );
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('handles invalid or non-numeric payload from provider and tries next', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { amount: 'invalid-number' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          stellar: {
            usd: 0.1425,
          },
        }),
      });

    const result = await priceService.getXlmPrice();
    expect(result.source).toBe('coingecko');
    expect(result.price).toBe('0.1425');
  });
});
