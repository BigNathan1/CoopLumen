import useSWR from 'swr';
import { fetcher } from './SWRProvider';

export interface Balance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
}

export interface BalancesFilters {
  communityId?: string;
}

export function useBalances(publicKey: string | null, filters: BalancesFilters = {}) {
  const params = new URLSearchParams();
  if (filters.communityId) params.set('communityId', filters.communityId);

  const query = params.toString();
  const path = publicKey ? `/api/v1/balances/${publicKey}${query ? `?${query}` : ''}` : null;

  return useSWR<Balance[]>(path, fetcher);
}