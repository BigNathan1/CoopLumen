import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface FeeEstimateResponse {
  fee: string; // The estimated fee string (e.g., in stroops or lumens depending on backend config)
  base_fee?: string;
  surge_multiplier?: number;
}

/**
 * Custom fetcher that serializes the operations array into a POST request.
 */
async function estimateFetcher([url, operations]: [string, Record[]]): Promise {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operations }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to estimate fee');
  }

  // Assume the backend returns the estimate wrapped in `{ data: { fee: "100" } }` or similar standard wrapper
  const json = await res.json();
  return json.data ?? json; 
}

/**
 * Hook to fetch the estimated transaction fee based on a given set of operations.
 * If the operations array is empty or undefined, the hook pauses and does not fetch.
 * 
 * @param operations Array of operations that will be included in the transaction
 * @returns { estimatedFee, isLoading, error }
 * 
 * @example
 * ```tsx
 * const operations = [{ type: 'payment', destination: 'GABC...', amount: '100' }];
 * const { estimatedFee, isLoading, error } = useEstimateFee(operations);
 * ```
 */
export function useEstimateFee(operations?: Record[]) {
  const shouldFetch = operations && operations.length > 0;

  const { data, error, isLoading, isValidating } = useSWR(
    // Serialize operations into the key via tuple to trigger re-fetches when operations change
    shouldFetch ? [`${API_URL}/api/v1/fees/estimate`, operations] : null,
    estimateFetcher,
    {
      keepPreviousData: true,
      dedupingInterval: 5000,
    }
  );

  return {
    estimatedFee: data?.fee ?? null,
    isLoading,
    isValidating,
    error,
  };
}