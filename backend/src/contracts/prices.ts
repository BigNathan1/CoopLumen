import { logger } from '../utils/logger';

export interface XlmPriceResult {
  asset: 'XLM';
  currency: 'USD';
  pair: 'XLM/USD';
  price: string;
  source: string;
  timestamp: string;
}

interface CoinbaseSpotResponse {
  data?: {
    base?: string;
    currency?: string;
    amount?: string;
  };
}

interface CoinGeckoPriceResponse {
  stellar?: {
    usd?: number;
  };
}

interface BinancePriceResponse {
  symbol?: string;
  price?: string;
}

interface KrakenTickerResponse {
  error?: string[];
  result?: Record<string, { c?: [string, string] }>;
}

export class PriceServiceClass {
  private coinbasePriceUrl: string;
  private coingeckoPriceUrl: string;
  private binancePriceUrl: string;
  private krakenPriceUrl: string;

  constructor() {
    this.coinbasePriceUrl =
      process.env.COINBASE_PRICE_URL ?? 'https://api.coinbase.com/v2/prices/XLM-USD/spot';
    this.coingeckoPriceUrl =
      process.env.COINGECKO_PRICE_URL ??
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd';
    this.binancePriceUrl =
      process.env.BINANCE_PRICE_URL ?? 'https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT';
    this.krakenPriceUrl =
      process.env.KRAKEN_PRICE_URL ?? 'https://api.kraken.com/0/public/Ticker?pair=XLMUSD';
  }

  async getXlmPrice(): Promise<XlmPriceResult> {
    const providers: Array<() => Promise<XlmPriceResult>> = [
      (): Promise<XlmPriceResult> => this.fetchFromCoinbase(),
      (): Promise<XlmPriceResult> => this.fetchFromCoinGecko(),
      (): Promise<XlmPriceResult> => this.fetchFromBinance(),
      (): Promise<XlmPriceResult> => this.fetchFromKraken(),
    ];

    let lastError: unknown = null;

    for (const provider of providers) {
      try {
        const result = await provider();
        if (result && Number(result.price) > 0) {
          return result;
        }
      } catch (err) {
        lastError = err;
        logger.warn('Price provider failed, attempting fallback provider', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw new Error(
      `Failed to fetch XLM price from all public sources: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

  private async fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
    return fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CoopLumen/0.1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  private async fetchFromCoinbase(): Promise<XlmPriceResult> {
    const res = await this.fetchWithTimeout(this.coinbasePriceUrl);
    if (!res.ok) {
      throw new Error(`Coinbase API returned status ${res.status}`);
    }

    const body = (await res.json()) as CoinbaseSpotResponse;
    const amount = body?.data?.amount;
    const parsedAmount = Number(amount);

    if (!amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Invalid price payload received from Coinbase');
    }

    return {
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: amount,
      source: 'coinbase',
      timestamp: new Date().toISOString(),
    };
  }

  private async fetchFromCoinGecko(): Promise<XlmPriceResult> {
    const res = await this.fetchWithTimeout(this.coingeckoPriceUrl);
    if (!res.ok) {
      throw new Error(`CoinGecko API returned status ${res.status}`);
    }

    const body = (await res.json()) as CoinGeckoPriceResponse;
    const usd = body?.stellar?.usd;

    if (
      usd === undefined ||
      usd === null ||
      typeof usd !== 'number' ||
      !Number.isFinite(usd) ||
      usd <= 0
    ) {
      throw new Error('Invalid price payload received from CoinGecko');
    }

    return {
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: String(usd),
      source: 'coingecko',
      timestamp: new Date().toISOString(),
    };
  }

  private async fetchFromBinance(): Promise<XlmPriceResult> {
    const res = await this.fetchWithTimeout(this.binancePriceUrl);
    if (!res.ok) {
      throw new Error(`Binance API returned status ${res.status}`);
    }

    const body = (await res.json()) as BinancePriceResponse;
    const priceStr = body?.price;
    const parsedPrice = Number(priceStr);

    if (!priceStr || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new Error('Invalid price payload received from Binance');
    }

    return {
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: priceStr,
      source: 'binance',
      timestamp: new Date().toISOString(),
    };
  }

  private async fetchFromKraken(): Promise<XlmPriceResult> {
    const res = await this.fetchWithTimeout(this.krakenPriceUrl);
    if (!res.ok) {
      throw new Error(`Kraken API returned status ${res.status}`);
    }

    const body = (await res.json()) as KrakenTickerResponse;
    if (body.error && body.error.length > 0) {
      throw new Error(`Kraken API returned error: ${body.error.join(', ')}`);
    }

    const pairData = body.result?.XXLMZUSD ?? body.result?.XLMUSD;
    const priceStr = pairData?.c?.[0];
    const parsedPrice = Number(priceStr);

    if (!priceStr || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new Error('Invalid price payload received from Kraken');
    }

    return {
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: priceStr,
      source: 'kraken',
      timestamp: new Date().toISOString(),
    };
  }
}

export const PriceService = new PriceServiceClass();
