import { Horizon } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { withStellarErrors } from './errors';

export interface DexOffer {
  id: string;
  pagingToken: string;
  seller: string;
  selling: {
    assetType: string;
    assetCode?: string;
    assetIssuer?: string;
  };
  buying: {
    assetType: string;
    assetCode?: string;
    assetIssuer?: string;
  };
  amount: string;
  priceR: {
    n: number;
    d: number;
  };
export const PRICE_FETCH_TIMEOUT_MS = 3500;

export interface XlmPriceResult {
  asset: string;
  currency: string;
  pair: string;
  price: string;
}

/**
 * Lists all open DEX offers for a given Stellar account public key.
 */
export async function getAccountOffers(publicKey: string): Promise<DexOffer[]> {
  return withStellarErrors('Get account offers', async () => {
    const server = StellarService.getServer();
    const offers: DexOffer[] = [];

    let page = await StellarService.call('offers.forAccount', () =>
      server.offers().forAccount(publicKey).limit(200).call()
    );

    while (page.records.length > 0) {
      for (const record of page.records) {
        offers.push({
          id: String(record.id),
          pagingToken: record.paging_token,
          seller: record.seller,
          selling: {
            assetType: record.selling.asset_type,
            ...(record.selling.asset_type !== 'native' && {
              assetCode: (record.selling as Horizon.ServerApi.AssetLine).asset_code,
              assetIssuer: (record.selling as Horizon.ServerApi.AssetLine).asset_issuer,
            }),
          },
          buying: {
            assetType: record.buying.asset_type,
            ...(record.buying.asset_type !== 'native' && {
              assetCode: (record.buying as Horizon.ServerApi.AssetLine).asset_code,
              assetIssuer: (record.buying as Horizon.ServerApi.AssetLine).asset_issuer,
            }),
          },
          amount: record.amount,
          priceR: {
            n: record.price_r.n,
            d: record.price_r.d,
          },
          price: record.price,
        });
      }

      if (page.records.length < 200) break;
      page = await StellarService.call('offers.forAccount.next', () => page.next());
// ---------------------------------------------------------------------------
// PriceServiceClass — Coinbase → CoinGecko → Binance → Kraken
// Used by contracts/__tests__/prices.test.ts which instantiates the class
// directly and tests the waterfall in that order.
// Price values are returned as raw strings (no padding to 7 decimals).
// ---------------------------------------------------------------------------

export class PriceServiceClass {
  private readonly timeoutMs: number;

  constructor(timeoutMs = PRICE_FETCH_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Fetches the XLM price using a 4-provider waterfall:
   * Coinbase → CoinGecko → Binance → Kraken.
   * Throws if all providers fail.
   */
  async getXlmPrice(currency = 'USD'): Promise<XlmPriceResult> {
    const providers: Array<[string, () => Promise<XlmPriceResult>]> = [
      ['coinbase', () => this._fetchFromCoinbase(currency)],
      ['coingecko', () => this._fetchFromCoinGecko(currency)],
      ['binance', () => this._fetchFromBinance(currency)],
      ['kraken', () => this._fetchFromKraken(currency)],
    ];

    const errors: string[] = [];
    for (const [name, fn] of providers) {
      try {
        const result = await fn();
        logger.info('Fetched XLM price', { source: name, currency, price: result.price });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Price provider failed, trying next', { provider: name, error: message });
        errors.push(`${name}: ${message}`);
      }
    }

    throw new Error(
      `Failed to fetch XLM price from all public sources. Errors: ${errors.join(' | ')}`
    );
  }

  private async _fetchFromCoinbase(currency: string): Promise<XlmPriceResult> {
    const cur = currency.toUpperCase();
    const url = `https://api.coinbase.com/v2/prices/XLM-${cur}/spot`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Coinbase responded with HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      data?: { base?: string; currency?: string; amount?: string };
    };
    const amount = body?.data?.amount;

    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error(`Coinbase returned unexpected payload: ${JSON.stringify(body)}`);
    }

    return {
      asset: 'XLM',
      currency: cur,
      pair: `XLM/${cur}`,
      price: amount,
      source: 'coinbase',
      timestamp: new Date().toISOString(),
    };
  }

  private async _fetchFromCoinGecko(currency: string): Promise<XlmPriceResult> {
    const cur = currency.toUpperCase();
    const curLower = currency.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=${curLower}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`CoinGecko responded with HTTP ${response.status}`);
    }

    const body = (await response.json()) as Record<string, Record<string, number>>;
    const priceNum = body?.stellar?.[curLower];

    if (typeof priceNum !== 'number' || !Number.isFinite(priceNum) || priceNum <= 0) {
      throw new Error(`CoinGecko returned unexpected payload: ${JSON.stringify(body)}`);
    }

    return {
      asset: 'XLM',
      currency: cur,
      pair: `XLM/${cur}`,
      price: String(priceNum),
      source: 'coingecko',
      timestamp: new Date().toISOString(),
    };
  }

  private async _fetchFromBinance(currency: string): Promise<XlmPriceResult> {
    const quoteCurrencies: Record<string, string> = { USD: 'USDT', USDT: 'USDT' };
    const quoteAsset = quoteCurrencies[currency.toUpperCase()];

    if (!quoteAsset) {
      throw new Error(`Binance provider does not support currency: ${currency}`);
    }

    const symbol = `XLM${quoteAsset}`;
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Binance responded with HTTP ${response.status}`);
    }

    const body = (await response.json()) as Record<string, string>;
    const priceStr = body?.price;

    if (!priceStr || Number.isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
      throw new Error(`Binance returned unexpected payload: ${JSON.stringify(body)}`);
    }

    return {
      asset: 'XLM',
      currency: currency.toUpperCase(),
      pair: `XLM/${currency.toUpperCase()}`,
      price: priceStr,
      source: 'binance',
      timestamp: new Date().toISOString(),
    };
  }

  private async _fetchFromKraken(currency: string): Promise<XlmPriceResult> {
    const cur = currency.toUpperCase();
    const krakenPair = `XXLMZ${cur}`;
    const url = `https://api.kraken.com/0/public/Ticker?pair=${krakenPair}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Kraken responded with HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      error?: string[];
      result?: Record<string, { c?: string[] }>;
    };

    if (body.error && body.error.length > 0) {
      throw new Error(`Kraken API error: ${body.error.join(', ')}`);
    }

    const ticker = body.result?.[krakenPair];
    const lastPrice = ticker?.c?.[0];

    if (!lastPrice || Number.isNaN(Number(lastPrice)) || Number(lastPrice) <= 0) {
      throw new Error(`Kraken returned unexpected payload: ${JSON.stringify(body)}`);
    }

    return {
      asset: 'XLM',
      currency: cur,
      pair: `XLM/${cur}`,
      price: lastPrice,
      source: 'kraken',
      timestamp: new Date().toISOString(),
    };
  }
}

/** Singleton for use by higher-level code that wants the class API. */
export const PriceService = new PriceServiceClass();

// ---------------------------------------------------------------------------
// fetchXlmPrice — standalone function used by the route handler
// Provider order: CoinGecko → Binance → Coinbase → Kraken
// Prices are normalised to 7 decimal places (toFixed(7)) for consistent
// response formatting.
// ---------------------------------------------------------------------------

async function routeFetchFromCoinGecko(currency: string): Promise<XlmPriceResult> {
  const cur = currency.toUpperCase();
  const curLower = currency.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=${curLower}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(PRICE_FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`CoinGecko responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as Record<string, Record<string, number>>;
  const priceNum = body?.stellar?.[curLower];

  if (typeof priceNum !== 'number' || !Number.isFinite(priceNum) || priceNum <= 0) {
    throw new Error(`CoinGecko returned unexpected payload: ${JSON.stringify(body)}`);
  }

  return {
    asset: 'XLM',
    currency: cur,
    pair: `XLM/${cur}`,
    price: priceNum.toFixed(7),
    source: 'coingecko',
    timestamp: new Date().toISOString(),
  };
}

async function routeFetchFromBinance(currency: string): Promise<XlmPriceResult> {
  const quoteCurrencies: Record<string, string> = { USD: 'USDT', USDT: 'USDT' };
  const quoteAsset = quoteCurrencies[currency.toUpperCase()];

  if (!quoteAsset) {
    throw new Error(`Binance provider does not support currency: ${currency}`);
  }

  const url = `https://api.binance.com/api/v3/ticker/price?symbol=XLM${quoteAsset}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(PRICE_FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Binance responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as Record<string, string>;
  const priceStr = body?.price;

  if (!priceStr || Number.isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
    throw new Error(`Binance returned unexpected payload: ${JSON.stringify(body)}`);
  }

  return {
    asset: 'XLM',
    currency: currency.toUpperCase(),
    pair: `XLM/${currency.toUpperCase()}`,
    price: priceStr,
    source: 'binance',
    timestamp: new Date().toISOString(),
  };
}

async function routeFetchFromCoinbase(currency: string): Promise<XlmPriceResult> {
  const cur = currency.toUpperCase();
  const url = `https://api.coinbase.com/v2/prices/XLM-${cur}/spot`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(PRICE_FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Coinbase responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as { data?: { amount?: string } };
  const amount = body?.data?.amount;

  if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new Error(`Coinbase returned unexpected payload: ${JSON.stringify(body)}`);
  }

  return {
    asset: 'XLM',
    currency: cur,
    pair: `XLM/${cur}`,
    price: Number(amount).toFixed(7),
    source: 'coinbase',
    timestamp: new Date().toISOString(),
  };
}

async function routeFetchFromKraken(currency: string): Promise<XlmPriceResult> {
  const cur = currency.toUpperCase();
  const krakenPair = `XXLMZ${cur}`;
  const url = `https://api.kraken.com/0/public/Ticker?pair=${krakenPair}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(PRICE_FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Kraken responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    error?: string[];
    result?: Record<string, { c?: string[] }>;
  };

  if (body.error && body.error.length > 0) {
    throw new Error(`Kraken API error: ${body.error.join(', ')}`);
  }

  const ticker = body.result?.[krakenPair];
  const lastPrice = ticker?.c?.[0];

  if (!lastPrice || Number.isNaN(Number(lastPrice)) || Number(lastPrice) <= 0) {
    throw new Error(`Kraken returned unexpected payload: ${JSON.stringify(body)}`);
  }

  return {
    asset: 'XLM',
    currency: cur,
    pair: `XLM/${cur}`,
    price: Number(lastPrice).toFixed(7),
    source: 'kraken',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetches the XLM/{currency} price with CoinGecko → Binance → Coinbase → Kraken
 * waterfall. Used by the route handler. Prices normalised to 7 decimal places.
 * Throws if all providers fail.
 */
export async function fetchXlmPrice(currency = 'USD'): Promise<XlmPriceResult> {
  const providers: Array<[string, () => Promise<XlmPriceResult>]> = [
    ['coingecko', () => routeFetchFromCoinGecko(currency)],
    ['binance', () => routeFetchFromBinance(currency)],
    ['coinbase', () => routeFetchFromCoinbase(currency)],
    ['kraken', () => routeFetchFromKraken(currency)],
  ];

  const errors: string[] = [];
  for (const [name, fn] of providers) {
    try {
      return await fn();
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return offers;
  });
  throw new Error(
    `Failed to fetch XLM price from all public sources. Errors: ${errors.join(' | ')}`
  );
}
