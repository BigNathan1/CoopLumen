import useSWR from 'swr';
import { api } from '@/lib/api';
import type { TransactionHistoryItem } from '@/components/TransactionHistory';

/** A row of the backend's `transactions_log` audit table. */
export interface TransactionLogRow {
  id: string;
  community_id: string | null;
  actor_address: string | null;
  action: string;
  stellar_tx_hash: string | null;
  metadata: unknown;
  created_at: string;
}

export interface TransactionPageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CommunityTransactionsPage {
  items: TransactionHistoryItem[];
  meta: TransactionPageMeta;
}

export const TRANSACTIONS_PAGE_SIZE = 20;

function readMetadataField(metadata: unknown, field: string): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const value = (metadata as Record<string, unknown>)[field];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Maps an audit-log row to what the transaction table shows.
 *
 * `transactions_log` has no status column: an entry is only written once the
 * action has happened. So a row with a Stellar transaction hash is `confirmed`,
 * and a row without one is `recorded` (it exists in the audit log but never
 * touched the ledger, such as a loan being created). The amount and asset live
 * in `metadata` for the actions that carry one.
 */
export function mapTransactionLogRow(row: TransactionLogRow): TransactionHistoryItem {
  return {
    id: row.id,
    hash: row.stellar_tx_hash,
    type: row.action,
    amount: readMetadataField(row.metadata, 'amount'),
    assetCode: readMetadataField(row.metadata, 'asset_code'),
    date: row.created_at,
    status: row.stellar_tx_hash ? 'confirmed' : 'recorded',
  };
}

function readMeta(meta: Record<string, unknown> | undefined, fallbackPage: number, count: number) {
  const number = (key: string, fallback: number): number => {
    const value = meta?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };

  return {
    total: number('total', count),
    page: number('page', fallbackPage),
    limit: number('limit', TRANSACTIONS_PAGE_SIZE),
    pages: number('pages', count > 0 ? 1 : 0),
  };
}

/** Fetches one page of a community's transaction history, newest first. */
export function useCommunityTransactions(communityId: string, page = 1) {
  return useSWR<CommunityTransactionsPage>(
    communityId ? ['community-transactions', communityId, page] : null,
    async () => {
      const envelope = await api.raw<TransactionLogRow[]>(
        'GET',
        `/api/v1/transactions/history/${encodeURIComponent(communityId)}`,
        { query: { page, limit: TRANSACTIONS_PAGE_SIZE }, auth: false }
      );
      const rows = envelope.data ?? [];

      return {
        items: rows.map(mapTransactionLogRow),
        meta: readMeta(envelope.meta, page, rows.length),
      };
    },
    { keepPreviousData: true }
  );
}
