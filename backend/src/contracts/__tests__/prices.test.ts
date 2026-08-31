import { getAccountOffers } from '../prices';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    call: jest.fn((_name: string, fn: () => unknown) => fn()),
  },
}));

describe('getAccountOffers', () => {
  const mockGetServer = StellarService.getServer as jest.Mock;
  const publicKey = 'GBUYXJ4MVNL4KXVR7ULKM7N5V2W5VLMZ4DPMQG4HNKQ3VHZK2Z2Z2Z';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists open DEX offers for an account', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      records: [
        {
          id: 12345,
          paging_token: '12345-0',
          seller: publicKey,
          selling: { asset_type: 'native' },
          buying: {
            asset_type: 'credit_alphanum4',
            asset_code: 'ECO',
            asset_issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
          },
          amount: '100.0000000',
          price_r: { n: 1, d: 2 },
          price: '0.5000000',
        },
      ],
    });

    const offersMock = jest.fn().mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: mockCall,
        }),
      }),
    });

    mockGetServer.mockReturnValue({ offers: offersMock });

    const offers = await getAccountOffers(publicKey);

    expect(offers).toHaveLength(1);
    expect(offers[0]).toEqual({
      id: '12345',
      pagingToken: '12345-0',
      seller: publicKey,
      selling: { assetType: 'native' },
      buying: {
        assetType: 'credit_alphanum4',
        assetCode: 'ECO',
        assetIssuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
      },
      amount: '100.0000000',
      priceR: { n: 1, d: 2 },
      price: '0.5000000',
    });
  });

  it('returns empty array when account has no open offers', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      records: [],
    });

    const offersMock = jest.fn().mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: mockCall,
        }),
      }),
    });

    mockGetServer.mockReturnValue({ offers: offersMock });

    const offers = await getAccountOffers(publicKey);
    expect(offers).toEqual([]);
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
