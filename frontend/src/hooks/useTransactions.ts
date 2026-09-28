import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** The `action` values `transactions_log` accepts, per its check constraint. */
export type TransactionAction =
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

/** A single row returned by `GET /api/v1/transactions/history/:communityId`. */
export interface TransactionLog {
  id: string;
  community_id: string | null;
  actor_address: string | null;
  action: TransactionAction;
  stellar_tx_hash: string | null;
  metadata: Record | null;
  created_at: string;
}

/** Pagination metadata returned alongside the transaction log page. */
export interface TransactionPageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
  offset: number;
}

export interface TransactionsFilters {
  /** 1-based page number. Omit to let the API default to page 1. */
  page?: number;
  /** Page size, capped server-side at 100. Omit to use the API default. */
  limit?: number;
  /** Earliest record, inclusive. ISO 8601 date-time string. */
  from?: string;
  /** Latest record, inclusive. ISO 8601 date-time string. */
  to?: string;
  /** Narrow the page to a single action type. Omit to return every action. */
  type?: TransactionAction;
}

/**
 * A single transaction log row with its pagination metadata, as returned by
 * the paginated history endpoint.
 */
export interface TransactionLogWithMeta {
  data: TransactionLog[];
  meta: TransactionPageMeta;
}

async function fetcher(url: string): Promise {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch transactions');
  }
  // Return the entire JSON object to preserve both `data` and `meta`
  return res.json() as Promise;
}

/**
 * Paginated community transaction history from `transactions_log`.
 *
 * Pass an empty `communityId` to defer the request (e.g. while a route param
 * is still resolving) — SWR treats a `null` key as "don't fetch". The returned
 * `meta` carries the page count, so consumers can derive total pages without
 * a second request.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useTransactions(communityId, {
 *   page: 2,
 *   limit: 20,
 *   type: 'payment_sent',
 * });
 * ```
 */
export function useTransactions(
  communityId: string,
  filters: TransactionsFilters = {}
): ReturnType> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.type) params.set('type', filters.type);

  const query = params.toString();
  const url = communityId
    ? `\({API_URL}/api/v1/transactions/history/\){communityId}\({query ? `?\){query}` : ''}`
    : null;

  return useSWR(url, fetcher, {
    refreshInterval: 30_000,
  });
}