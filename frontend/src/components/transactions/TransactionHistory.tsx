'use client';

import { useState } from 'react';
import { useTransactionHistory, type TransactionLogEntry } from '@/hooks/useTransactions';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PaginationInner } from '@/components/ui/Pagination';
import styles from './TransactionHistory.module.css';

interface Props {
  communityId: string;
  /** Rows per page. Defaults to 20. */
  pageSize?: number;
}

const ACTION_LABEL: Record<TransactionLogEntry['action'], string> = {
  community_created: 'Community created',
  member_added: 'Member added',
  member_removed: 'Member removed',
  token_issued: 'Token issued',
  payment_sent: 'Payment sent',
  trustline_established: 'Trustline established',
  trustline_removed: 'Trustline removed',
  loan_created: 'Loan created',
  loan_disbursed: 'Loan disbursed',
  loan_repayment: 'Loan repayment',
  loan_closed: 'Loan closed',
  loan_defaulted: 'Loan defaulted',
};

const ACTION_VARIANT: Record<TransactionLogEntry['action'], BadgeVariant> = {
  community_created: 'info',
  member_added: 'success',
  member_removed: 'warning',
  token_issued: 'success',
  payment_sent: 'info',
  trustline_established: 'success',
  trustline_removed: 'warning',
  loan_created: 'info',
  loan_disbursed: 'success',
  loan_repayment: 'success',
  loan_closed: 'neutral',
  loan_defaulted: 'error',
};

/** Shortens a Stellar address to `GABC…WXYZ` for compact display. */
function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-6)}` : hash;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function TransactionHistory({ communityId, pageSize = 20 }: Props) {
  const [page, setPage] = useState(1);
  const { data, meta, error, isLoading } = useTransactionHistory(communityId, {
    page,
    limit: pageSize,
  });

  if (isLoading) {
    return (
      <div className={styles.state} role="status" aria-live="polite">
        Loading transaction history…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.state} ${styles.error}`} role="alert">
        Could not load transaction history.
      </div>
    );
  }

  if (!data?.length) {
    return (
      <EmptyState
        title="No transactions yet"
        message="Activity for this community will show up here."
      />
    );
  }

  return (
    <div className={styles.panel}>
      <ol className={styles.list}>
        {data.map((entry) => (
          <li key={entry.id} className={styles.entry}>
            <Badge variant={ACTION_VARIANT[entry.action]} size="sm">
              {ACTION_LABEL[entry.action] ?? entry.action}
            </Badge>

            {entry.actor_address && (
              <span className={styles.actor} title={entry.actor_address}>
                {shortAddress(entry.actor_address)}
              </span>
            )}

            {entry.stellar_tx_hash && (
              <a
                className={styles.hash}
                href={`https://stellar.expert/explorer/public/tx/${entry.stellar_tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                title={entry.stellar_tx_hash}
              >
                {shortHash(entry.stellar_tx_hash)}
              </a>
            )}

            <time className={styles.time} dateTime={entry.created_at}>
              {formatTimestamp(entry.created_at)}
            </time>
          </li>
        ))}
      </ol>

      {meta && meta.pages > 1 && (
        <PaginationInner totalPages={meta.pages} page={page} onPageChange={setPage} />
      )}
    </div>
  );
}
