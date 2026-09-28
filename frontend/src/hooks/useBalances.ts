import useSWR from 'swr';
import { fetcher } from './SWRProvider';

export interface Balance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
}

export function useBalances(publicKey: string | null) {
  return useSWR<Balance[]>(publicKey ? `/api/v1/balances/${publicKey}` : null, fetcher);
}