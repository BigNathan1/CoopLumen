import useSWR from 'swr';
import { fetcher } from '@/lib/swr';

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

/** All tokens issued for a community, newest last (as returned by the API). */
export function useCommunityTokens(communityId: string | null | undefined) {
  return useSWR<Token[]>(communityId ? `/api/v1/tokens/${communityId}` : null, fetcher);
}
