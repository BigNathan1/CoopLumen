import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Token {
  id: string;
  community_id: string;
  asset_code: string;
  asset_issuer: string;
  distributor_address: string;
  total_supply: string;
  name: string | null;
  description: string | null;
  icon_url: string | null;
  decimals: number | null;
  created_at: string;
  updated_at: string;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch tokens');
  }
  return (res.json() as Promise<{ data: T }>).then((r) => r.data);
}

/** All tokens issued for a community, newest last (as returned by the API). */
export function useCommunityTokens(communityId: string | null | undefined) {
  return useSWR<Token[]>(communityId ? `${API_URL}/api/v1/tokens/${communityId}` : null, fetcher, {
    refreshInterval: 30_000,
  });
}
