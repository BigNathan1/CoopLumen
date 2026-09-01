import { fetchXlmPrice } from '../prices';

/** Builds the fetch Response shape each provider parses. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const coinGeckoBody = { stellar: { usd: 0.1425 } };
const binanceBody = { price: '0.14260000' };
const coinbaseBody = { data: { base: 'XLM', currency: 'USD', amount: '0.1427' } };
const krakenBody = { error: [], result: { XXLMZUSD: { c: ['0.1428', '100'] } } };

describe('fetchXlmPrice', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns the CoinGecko price without consulting the other providers', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(coinGeckoBody));

    await expect(fetchXlmPrice()).resolves.toEqual({
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: '0.1425000',
      source: 'coingecko',
      timestamp: expect.any(String),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to Binance when CoinGecko fails', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(binanceBody));

    const result = await fetchXlmPrice();

    expect(result.source).toBe('binance');
    expect(result.price).toBe('0.1426000');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to Coinbase when CoinGecko and Binance fail', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(jsonResponse(coinbaseBody));

    const result = await fetchXlmPrice();

    expect(result.source).toBe('coinbase');
    expect(result.price).toBe('0.1427000');
  });

  it('falls back to Kraken when every earlier provider fails', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(jsonResponse(krakenBody));

    const result = await fetchXlmPrice();

    expect(result.source).toBe('kraken');
    expect(result.price).toBe('0.1428000');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('treats an unparseable payload as a provider failure and moves on', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ stellar: { usd: 'not-a-number' } }))
      .mockResolvedValueOnce(jsonResponse(binanceBody));

    await expect(fetchXlmPrice()).resolves.toMatchObject({ source: 'binance' });
  });

  it('reports every provider error when none succeeds', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('unreachable'));

    await expect(fetchXlmPrice()).rejects.toThrow(
      /Failed to fetch XLM price from all public sources/
    );
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('carries the requested currency through to the result', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse({ stellar: { eur: 0.13 } }));

    await expect(fetchXlmPrice('EUR')).resolves.toMatchObject({
      currency: 'EUR',
      pair: 'XLM/EUR',
      source: 'coingecko',
    });
  });
});
