export const PRICE_FETCH_TIMEOUT_MS = 3500;

export interface XlmPriceResult {
  asset: string;
  currency: string;
  pair: string;
  price: string;
  source: string;
  timestamp: string;
}

/*
 * One provider function per source. Each throws on any failure - a non-2xx
 * response, an unparseable body, a non-positive price - so fetchXlmPrice can
 * move to the next source. Prices are normalised to seven decimal places to
 * match the precision Stellar itself uses.
 */

async function fetchFromCoinGecko(currency: string): Promise<XlmPriceResult> {
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

async function fetchFromBinance(currency: string): Promise<XlmPriceResult> {
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
    price: Number(priceStr).toFixed(7),
    source: 'binance',
    timestamp: new Date().toISOString(),
  };
}

async function fetchFromCoinbase(currency: string): Promise<XlmPriceResult> {
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

async function fetchFromKraken(currency: string): Promise<XlmPriceResult> {
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
 * Fetches the XLM/{currency} price with CoinGecko -> Binance -> Coinbase -> Kraken
 * waterfall. Used by the route handler. Prices normalised to 7 decimal places.
 * Throws if all providers fail.
 */
export async function fetchXlmPrice(currency = 'USD'): Promise<XlmPriceResult> {
  const providers: Array<[string, () => Promise<XlmPriceResult>]> = [
    ['coingecko', () => fetchFromCoinGecko(currency)],
    ['binance', () => fetchFromBinance(currency)],
    ['coinbase', () => fetchFromCoinbase(currency)],
    ['kraken', () => fetchFromKraken(currency)],
  ];

  const errors: string[] = [];
  for (const [name, fn] of providers) {
    try {
      return await fn();
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `Failed to fetch XLM price from all public sources. Errors: ${errors.join(' | ')}`
  );
}
