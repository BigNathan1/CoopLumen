import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Balance } from './useBalances';

/** Response of `GET /api/v1/communities/:id/treasury`. */
export interface Treasury {
  /** Public key of the community's treasury (issuer) account. */
  account: string;
  /** Live balances of that account, straight from Stellar Horizon. */
  balances: Balance[];
}

/** How often the on-chain balances are re-read while the page is open. */
export const TREASURY_REFRESH_MS = 30_000;

/**
 * Orders balances for display: the native XLM balance first, then issued
 * assets alphabetically by code (ties broken by issuer), so the list does not
 * reshuffle between refreshes.
 */
export function sortBalances(balances: Balance[]): Balance[] {
  return [...balances].sort((a, b) => {
    const aNative = a.asset_type === 'native';
    const bNative = b.asset_type === 'native';
    if (aNative !== bNative) return aNative ? -1 : 1;

    const byCode = (a.asset_code ?? '').localeCompare(b.asset_code ?? '');
    return byCode !== 0 ? byCode : (a.asset_issuer ?? '').localeCompare(b.asset_issuer ?? '');
  });
}

/** Fetches a community's treasury account and its live on-chain balances. */
export function useTreasury(communityId: string) {
  return useSWR<Treasury>(
    communityId ? ['community-treasury', communityId] : null,
    () =>
      api.get<Treasury>(`/api/v1/communities/${encodeURIComponent(communityId)}/treasury`, {
        auth: false,
      }),
    { refreshInterval: TREASURY_REFRESH_MS }
  );
}
