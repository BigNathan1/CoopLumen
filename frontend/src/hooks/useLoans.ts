import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch loans');
  }
  return (res.json() as Promise<{ data: T }>).then((r) => r.data);
}

export interface LoanFilters {
  communityId?: string;
  borrower?: string;
  lender?: string;
  status?: LoanStatus;
  limit?: number;
}

/** Paginated loan list, newest first. Optional filters map to API query params. */
export function useLoans(filters: LoanFilters = {}) {
  const params = new URLSearchParams({ limit: String(filters.limit ?? 10) });
  if (filters.communityId) params.set('communityId', filters.communityId);
  if (filters.borrower) params.set('borrower', filters.borrower);
  if (filters.lender) params.set('lender', filters.lender);
  if (filters.status) params.set('status', filters.status);
  return useSWR<Loan[]>(`${API_URL}/api/v1/loans?${params.toString()}`, fetcher, {
    refreshInterval: 30_000,
  });
}

/**
 * A single loan with its outstanding balance and full event history. Pass
 * `enabled: false` to defer the request until the caller needs it (e.g. only
 * when a card's history is expanded).
 */
export function useLoan(id: string, enabled = true) {
  return useSWR<LoanDetail>(enabled ? `${API_URL}/api/v1/loans/${id}` : null, fetcher);
}
