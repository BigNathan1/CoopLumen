import useSWR from 'swr';
import { fetcher } from '@/lib/swr';

export type LoanStatus = 'pending' | 'active' | 'repaid' | 'defaulted' | 'cancelled';

export interface Loan {
  id: string;
  community_id: string;
  borrower_address: string;
  lender_address: string;
  amount: string;
  amount_repaid: string;
  interest_rate: string;
  asset_code: string;
  asset_issuer: string | null;
  purpose: string | null;
  status: LoanStatus;
  due_at: string | null;
  disbursed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Principal + flat interest, computed server-side (Stellar-precision string). */
  total_due: string;
  /** total_due − amount_repaid, computed server-side (Stellar-precision string). */
  outstanding: string;
}

export interface LoanEvent {
  id: string;
  loan_id: string;
  event_type: 'created' | 'disbursed' | 'repayment' | 'closed' | 'defaulted';
  amount: string | null;
  payment_id: string | null;
  note: string | null;
  created_at: string;
}

export interface LoanDetail extends Loan {
  events: LoanEvent[];
}

export interface LoanFilters {
  communityId?: string;
  borrower?: string;
  lender?: string;
  status?: LoanStatus;
  limit?: number;
}

export type CommunityLoanFilters = Omit<LoanFilters, 'communityId'>;

/**
 * Paginated loan list, newest first. Call it as `useLoans(communityId, filters)`
 * or `useLoans(filters)`; a `null` or empty community id defers the request.
 */
export function useLoans(
  communityId: string | null,
  filters?: CommunityLoanFilters
): ReturnType<typeof useSWR<Loan[]>>;
export function useLoans(filters?: LoanFilters): ReturnType<typeof useSWR<Loan[]>>;
export function useLoans(
  communityIdOrFilters?: string | null | LoanFilters,
  maybeFilters?: CommunityLoanFilters
) {
  const deferred = communityIdOrFilters === null || communityIdOrFilters === '';

  const filters: LoanFilters =
    typeof communityIdOrFilters === 'string'
      ? { ...maybeFilters, communityId: communityIdOrFilters }
      : (communityIdOrFilters ?? {});

  const params = new URLSearchParams({ limit: String(filters.limit ?? 10) });
  if (filters.communityId) params.set('communityId', filters.communityId);
  if (filters.borrower) params.set('borrower', filters.borrower);
  if (filters.lender) params.set('lender', filters.lender);
  if (filters.status) params.set('status', filters.status);

  // One unconditional useSWR call keeps the hook order stable across renders.
  return useSWR<Loan[]>(deferred ? null : `/api/v1/loans?${params.toString()}`, fetcher);
}

/**
 * A single loan with its outstanding balance and full event history. A
 * missing id, or `enabled: false`, defers the request until the caller needs
 * it (e.g. only when a card's history is expanded).
 */
export function useLoan(id: string | null | undefined, enabled = true) {
  const key = enabled && id ? `/api/v1/loans/${encodeURIComponent(id)}` : null;
  return useSWR<LoanDetail>(key, fetcher);
}
