import useSWR from 'swr';
import { fetcher } from './SWRProvider';
import type { Balance } from './useBalances';

export interface TreasuryBalance {
  account: string;
  balances: Balance[];
}

/**
 * Community treasury balances — the issuer account's on-chain balances.
 * Returns `{ account, balances[] }` via `GET /api/v1/communities/:id/treasury`.
 * Pass `null` or empty string to defer the request.
 */
export function useTreasuryBalance(communityId: string | null | undefined) {
  return useSWR<TreasuryBalance>(
    communityId ? `/api/v1/communities/${communityId}/treasury` : null,
    fetcher
  );
}
