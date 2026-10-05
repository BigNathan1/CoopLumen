import useSWR from 'swr';
import { fetcher } from '@/lib/swr';

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

export interface ReputationSummary {
  total_loans: number;
  on_time_repayments: number;
  defaults: number;
}

export interface ReputationDetail {
  address: string;
  communities: ReputationScore[];
  summary: ReputationSummary;
}

/**
 * Reputation leaderboard, highest score first. Optionally scoped to a single
 * community; `limit` caps how many entries the panel requests.
 */
export function useReputation(communityId?: string, limit = 10) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (communityId) params.set('communityId', communityId);
  return useSWR<ReputationScore[]>(`/api/v1/reputation?${params.toString()}`, fetcher);
}

/**
 * A single member's reputation across every community they participate in, plus
 * an aggregate summary. The API returns 404 when the address has no history, so
 * callers should treat an error as "no reputation yet".
 */
export function useReputationDetail(address: string | null) {
  return useSWR<ReputationDetail>(address ? `/api/v1/reputation/${address}` : null, fetcher, {
    shouldRetryOnError: false,
  });
}
