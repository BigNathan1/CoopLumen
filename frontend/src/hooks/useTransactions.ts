import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** The `action` values `transactions_log` accepts, per the backend's check constraint. */
export type TransactionLogAction =
  | 'community_created'
  | 'member_added'
  | 'member_removed'
  | 'token_issued'
  | 'payment_sent'
  | 'trustline_established'
  | 'trustline_removed'
  | 'loan_created'
  | 'loan_disbursed'
  | 'loan_repayment'
  | 'loan_closed'
  | 'loan_defaulted';

export interface TransactionLogEntry {
  id: string;
  community_id: string | null;
  actor_address: string | null;
  action: TransactionLogAction;
  stellar_tx_hash: string | null;
  metadata: unknown;
  created_at: string;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
  offset: number;
}

export interface TransactionHistoryFilters {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  type?: TransactionLogAction;
}

interface Envelope<T> {
  data: T;
  meta?: PageMeta;
}

async function fetcher<T>(url: string): Promise<Envelope<T>> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch transaction history');
  }
  return res.json() as Promise<Envelope<T>>;
}

/** Paginated audit-log history for a community, from `transactions_log`. */
export function useTransactionHistory(
  communityId: string | null,
  filters: TransactionHistoryFilters = {}
) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 20),
  });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.type) params.set('type', filters.type);

  const key = communityId
    ? `${API_URL}/api/v1/transactions/history/${communityId}?${params.toString()}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<Envelope<TransactionLogEntry[]>>(
    key,
    fetcher,
    { refreshInterval: 30_000 }
  );

  return {
    data: data?.data,
    meta: data?.meta,
    error,
    isLoading,
    mutate,
  };
}
