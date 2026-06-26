import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Balance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch balances');
  return (res.json() as Promise<{ data: T }>).then((r) => r.data);
}

export function useBalances(publicKey: string | null) {
  return useSWR<Balance[]>(publicKey ? `${API_URL}/api/v1/balances/${publicKey}` : null, fetcher, {
    refreshInterval: 15_000,
  });
}
