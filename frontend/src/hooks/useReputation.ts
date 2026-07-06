import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ReputationScore {
  id: string;
  stellar_address: string;
  community_id: string;
  score: string;
  total_loans: number;
  on_time_repayments: number;
  defaults: number;
  last_calculated_at: string;
  updated_at: string;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch reputation');
  }
  return (res.json() as Promise<{ data: T }>).then((r) => r.data);
}

/**
 * Reputation leaderboard, highest score first. Optionally scoped to a single
 * community; `limit` caps how many entries the panel requests.
 */
export function useReputation(communityId?: string, limit = 10) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (communityId) params.set('communityId', communityId);
  return useSWR<ReputationScore[]>(`${API_URL}/api/v1/reputation?${params.toString()}`, fetcher, {
    refreshInterval: 30_000,
  });
}
