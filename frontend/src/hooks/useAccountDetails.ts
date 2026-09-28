import useSWR from 'swr';
import type { Balance } from './useBalances';
import { fetcher } from './SWRProvider';

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

/**
 * Full on-chain account state — balances, signers and signing thresholds —
 * for a given Stellar public key, via `GET /api/v1/accounts/:publicKey`.
 */
export function useAccountDetails(publicKey: string | null) {
  return useSWR<AccountDetails>(publicKey ? `/api/v1/accounts/${publicKey}` : null, fetcher);
}