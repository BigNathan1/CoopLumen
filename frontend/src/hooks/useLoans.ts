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
  asset_code: string;
  asset_issuer: string | null;
  purpose: string | null;
  status: LoanStatus;
  due_at: string | null;
  disbursed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
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
