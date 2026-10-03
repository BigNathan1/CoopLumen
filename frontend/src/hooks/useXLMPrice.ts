import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Structure of the XLM price data returned by the backend. */
export interface XLMPriceData {
  price: string; // Using string to prevent precision loss, or number depending on your backend
  currency: string;
  updated_at: string;
}

async function fetcher(url: string): Promise {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch XLM price');
  }
  return res.json() as Promise;
}

/**
 * Fetches the current XLM price and polls for updates every 60 seconds.
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useXLMPrice();
 * if (data) console.log(`Current price: $${data.price}`);
 * ```
 */
export function useXLMPrice() {
  const url = `${API_URL}/api/v1/prices/xlm`;

  return useSWR(url, fetcher, {
    refreshInterval: 60_000, // Poll every 60 seconds
    dedupingInterval: 10_000, // Prevent redundant requests if mounted in multiple places simultaneously
  });
}