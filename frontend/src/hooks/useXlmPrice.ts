import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';

/** Shape returned by GET /api/v1/prices/xlm */
export interface XlmPriceResult {
  asset: string;
  currency: string;
  pair: string;
  /** Price as a string with 7 decimal places, e.g. "0.1425000". */
  price: string;
  source: string;
  timestamp: string;
}

/**
 * Fetches the current XLM/USD price from the backend and caches it for 60 s.
 *
 * Returns `{ data, error, isLoading }`. `data` is `null` while the price is
 * still loading or when the fetch fails — callers should guard before using it
 * in calculations.
 */
export function useXlmPrice(currency = 'USD') {
  return useSWR<XlmPriceResult>(
    `/api/v1/prices/xlm?currency=${currency}`,
    swrFetcher<XlmPriceResult>,
    {
      // The backend caches price data for 30 s; re-fetch every 60 s to stay
      // reasonably current without hammering the upstream providers.
      refreshInterval: 60_000,
      // Keep the last known price visible while a background refresh runs so
      // balances never blank out mid-session.
      keepPreviousData: true,
    }
  );
}

/**
 * Multiplies `balance` (the Stellar 7-decimal string) by `xlmPriceUsd` and
 * formats the result as a USD string, e.g. `"$14.25"`.
 *
 * Returns `null` when either argument is missing or not a finite number.
 */
export function toUsdEquivalent(balance: string, xlmPriceUsd: string | null | undefined): string | null {
  if (!xlmPriceUsd) return null;
  const amount = parseFloat(balance);
  const price = parseFloat(xlmPriceUsd);
  if (!isFinite(amount) || !isFinite(price) || price <= 0) return null;
  return (amount * price).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
