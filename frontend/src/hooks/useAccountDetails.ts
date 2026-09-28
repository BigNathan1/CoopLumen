import useSWR from 'swr';
import type { Balance } from './useBalances';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface AccountSigner {
  key: string;
  weight: number;
  type: string;
}

export interface AccountThresholds {
  low_threshold: number;
  med_threshold: number;
  high_threshold: number;
}

export interface AccountDetails {
  id: string;
  account_id: string;
  balances: Balance[];
  signers: AccountSigner[];
  thresholds: AccountThresholds;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch account details');
  return (res.json() as Promise<{ data: T }>).then((r) => r.data);
}

/**
 * Full on-chain account state — balances, signers and signing thresholds —
 * for a given Stellar public key, via `GET /api/v1/accounts/:publicKey`.
 */
export function useAccountDetails(publicKey: string | null) {
  return useSWR<AccountDetails>(
    publicKey ? `${API_URL}/api/v1/accounts/${publicKey}` : null,
    fetcher,
    { refreshInterval: 30_000 }
  );
}
