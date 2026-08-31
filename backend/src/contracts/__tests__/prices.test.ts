import { Horizon } from '@stellar/stellar-sdk';
import { getOrderBook } from '../prices';
import { StellarService } from '../stellar';
import { StellarError } from '../errors';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    call: jest.fn((_name: string, fn: () => unknown) => fn()),
  },
}));

describe('getOrderBook', () => {
  const mockGetServer = StellarService.getServer as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches and returns the order book for native and issued assets', async () => {
    const mockOrderBookCall = jest.fn().mockResolvedValue({
      bids: [
        { price_r: { n: 1, d: 2 }, price: '0.5000000', amount: '100.0000000' },
      ],
      asks: [
        { price_r: { n: 3, d: 5 }, price: '0.6000000', amount: '200.0000000' },
      ],
      base: { asset_type: 'native' },
      counter: {
        asset_type: 'credit_alphanum4',
        asset_code: 'ECO',
        asset_issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
      },
    });

    const mockOrderBookBuilder = {
      call: mockOrderBookCall,
    };

    const mockServer = {
      orderBook: jest.fn().mockReturnValue(mockOrderBookBuilder),
    };

    mockGetServer.mockReturnValue(mockServer);

    const result = await getOrderBook(
      { code: 'XLM' },
      { code: 'ECO', issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P' }
    );

    expect(mockServer.orderBook).toHaveBeenCalled();
    expect(mockOrderBookCall).toHaveBeenCalled();
    expect(result.bids).toHaveLength(1);
    expect(result.asks).toHaveLength(1);
    expect(result.bids[0].price).toBe('0.5000000');
  });

  it('throws an error if non-native asset lacks an issuer', async () => {
    await expect(
      getOrderBook({ code: 'XLM' }, { code: 'ECO' })
    ).rejects.toThrow('Asset issuer is required for non-native asset: ECO');
  });

  it('maps Horizon errors via withStellarErrors', async () => {
    const horizonError = new Error('Not Found');
    (horizonError as any).response = {
      status: 404,
      data: { title: 'Not Found', detail: 'Resource missing' },
    };

    const mockServer = {
      orderBook: jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue(horizonError),
      }),
    };

    mockGetServer.mockReturnValue(mockServer);

    await expect(
      getOrderBook({ code: 'XLM' }, { code: 'ECO', issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P' })
    ).rejects.toBeInstanceOf(StellarError);
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
