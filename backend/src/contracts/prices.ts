import { logger } from '../utils/logger';

export interface XlmPriceData {
  asset: string;
  currency: string;
  price: string;
  source: string;
  timestamp: string;
}

const FETCH_TIMEOUT_MS = 3500;

async function fetchFromCoinGecko(currency: string): Promise<XlmPriceData | null> {
  try {
    const curLower = currency.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=${curLower}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { stellar?: Record<string, number> };
    const priceNum = json.stellar?.[curLower];
    if (priceNum !== undefined && Number.isFinite(priceNum)) {
      return {
        asset: 'XLM',
        currency,
        price: priceNum.toFixed(7),
        source: 'coingecko',
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchFromBinance(currency: string): Promise<XlmPriceData | null> {
  if (currency !== 'USD' && currency !== 'USDT') return null;
  try {
    const url = 'https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT';
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { price?: string };
    if (json.price && !Number.isNaN(Number(json.price))) {
      return {
        asset: 'XLM',
        currency,
        price: Number(json.price).toFixed(7),
        source: 'binance',
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchFromCoinbase(currency: string): Promise<XlmPriceData | null> {
  try {
    const url = `https://api.coinbase.com/v2/prices/XLM-${currency}/spot`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { amount?: string } };
    if (json.data?.amount && !Number.isNaN(Number(json.data.amount))) {
      return {
        asset: 'XLM',
        currency,
        price: Number(json.data.amount).toFixed(7),
        source: 'coinbase',
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchXlmPrice(currency = 'USD'): Promise<XlmPriceData> {
  const providers = [fetchFromCoinGecko, fetchFromBinance, fetchFromCoinbase];

  for (const provider of providers) {
    const result = await provider(currency);
    if (result) {
      return result;
    }
  }

  logger.error('Failed to fetch XLM price from all public price sources', { currency });
  throw new Error('Failed to fetch XLM price from public source.');
}
