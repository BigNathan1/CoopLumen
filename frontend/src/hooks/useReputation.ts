import { useCallback, useEffect, useState } from 'react';
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
export function useReputationLeaderboard(communityId?: string, limit = 10) {
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

export interface ReputationData {
  address: string;
  score: number;
  completedLoans: number;
  onTimeRepayments: number;
  updatedAt?: string;
}

export interface UseReputationResult {
  data: ReputationData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const STELLAR_G_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export function isValidMemberAddress(address: string | undefined | null): address is string {
  if (!address || typeof address !== 'string') return false;
  const trimmed = address.trim();
  return HEX_ADDRESS_RE.test(trimmed) || STELLAR_G_ADDRESS_RE.test(trimmed);
}

/**
 * One member's reputation score, fetched only once `address` is a valid member
 * address; anything else leaves the hook idle with no data and no error.
 */
export function useReputation(address: string | undefined | null): UseReputationResult {
  const [data, setData] = useState<ReputationData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReputation = useCallback(async () => {
    if (!isValidMemberAddress(address)) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const normalized = address.trim();
      const response = await fetch(`/api/v1/reputation/${encodeURIComponent(normalized)}`);
      if (!response.ok) {
        throw new Error(`Failed to load reputation (${response.status})`);
      }
      const payload = (await response.json()) as { data: ReputationData };
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reputation');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isValidMemberAddress(address)) {
        if (!cancelled) {
          setData(null);
          setError(null);
          setIsLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const normalized = address.trim();
        const response = await fetch(`/api/v1/reputation/${encodeURIComponent(normalized)}`);
        if (!response.ok) {
          throw new Error(`Failed to load reputation (${response.status})`);
        }
        const payload = (await response.json()) as { data: ReputationData };
        if (!cancelled) {
          setData(payload.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load reputation');
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [address]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchReputation,
  };
}
