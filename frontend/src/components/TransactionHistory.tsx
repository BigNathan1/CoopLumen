'use client';

import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { CopyToClipboard } from '@/components/ui/CopyToClipboard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Table, type TableColumn } from '@/components/ui/Table';
import styles from './TransactionHistory.module.css';

/**
 * Where a transaction stands.
 *
 * - `confirmed`: settled on the Stellar ledger.
 * - `pending`: submitted, not yet settled.
 * - `failed`: rejected by the network.
 * - `recorded`: kept in the community audit log without an on-chain transaction
 *   (for example a loan being created), so there is no hash to show.
 */
export type TransactionStatus = 'confirmed' | 'pending' | 'failed' | 'recorded';

export interface TransactionHistoryItem {
  /** Stable identifier, used as the React key source and for tests. */
  id: string;
  /** Stellar transaction hash, or `null` when the entry has no on-chain transaction. */
  hash: string | null;
  /** Machine action code, such as `payment_sent` or `loan_repayment`. */
  type: string;
  /** Decimal amount as a string (Stellar amounts carry 7 decimals), or `null` when not applicable. */
  amount: string | null;
  /** Asset the amount is denominated in, shown after the amount when present. */
  assetCode?: string | null;
  /** ISO 8601 timestamp. */
  date: string;
  status: TransactionStatus;
}

export interface TransactionHistoryProps {
  transactions: TransactionHistoryItem[];
  /** Shows a skeleton in place of the table. */
  isLoading?: boolean;
  /** Message shown in place of the table when loading the history failed. */
  error?: string | null;
  /** Stellar network used for explorer links. Defaults to `mainnet`. */
  network?: 'testnet' | 'mainnet';
  /** Accessible name of the table. Defaults to `Transaction history`. */
  ariaLabel?: string;
}

const TYPE_LABELS: Record<string, string> = {
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

const STATUS_META: Record<TransactionStatus, { label: string; variant: BadgeVariant }> = {
  confirmed: { label: 'Confirmed', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  failed: { label: 'Failed', variant: 'error' },
  recorded: { label: 'Recorded', variant: 'neutral' },
};

/** `loan_repayment` -> `Loan repayment` for action codes without a curated label. */
function humanizeType(type: string): string {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  const spaced = type.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Unknown';
}

/** `GABCDEFGH...` -> `GABCDE...EFGH`. Short values pass through unchanged. */
export function truncateHash(hash: string, start = 8, end = 6): string {
  if (hash.length <= start + end + 3) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

/**
 * Formats a decimal string for display without going through floating point,
 * so 7-decimal Stellar amounts never lose precision: `1234.5000000` -> `1,234.5`.
 */
export function formatAmount(amount: string): string {
  const trimmed = amount.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return trimmed;

  const [, sign, integer, fraction = ''] = match;
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = fraction.replace(/0+$/, '');
  return `${sign}${grouped}${decimals ? `.${decimals}` : ''}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

type Row = TransactionHistoryItem & Record<string, unknown>;

/**
 * Table of a community's transactions with hash, type, amount, date, and
 * status columns.
 *
 * Built on the shared `Table`, `Badge`, and `LoadingSkeleton` primitives, so it
 * follows the `globals.css` design tokens and switches theme with the rest of
 * the app. Rows are shown in the order given; the caller decides sorting (the
 * API returns newest first).
 *
 * Accessibility notes:
 *
 * - Status is always spelled out in text, never conveyed by colour alone.
 * - The hash links to the Stellar Expert explorer and has its own copy button;
 *   the full hash is available through the link's accessible name.
 * - Dates render in a `<time>` element with the ISO value in `dateTime`.
 * - Loading is announced once through the skeleton's live region and failures
 *   through an `alert`.
 */
export function TransactionHistory({
  transactions,
  isLoading = false,
  error = null,
  network = 'mainnet',
  ariaLabel = 'Transaction history',
}: TransactionHistoryProps) {
  if (isLoading) {
    return (
      <LoadingSkeleton variant="rect" height={44} count={5} gap={8} label="Loading transactions" />
    );
  }

  if (error) {
    return (
      <Alert variant="error" title="Could not load transactions">
        {error}
      </Alert>
    );
  }

  const columns: TableColumn<Row>[] = [
    {
      key: 'hash',
      label: 'Hash',
      render: (_value, row) =>
        row.hash ? (
          <span className={styles.hashCell}>
            <a
              className={styles.hashLink}
              href={`https://stellar.expert/explorer/${network}/tx/${encodeURIComponent(row.hash)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View transaction ${row.hash} on Stellar Expert`}
              title={row.hash}
            >
              <code>{truncateHash(row.hash)}</code>
            </a>
            <CopyToClipboard
              value={row.hash}
              label="Copy hash"
              copiedLabel="Copied"
              className={styles.copyButton}
            />
          </span>
        ) : (
          <span className={styles.muted}>No on-chain transaction</span>
        ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (_value, row) => humanizeType(row.type),
    },
    {
      key: 'amount',
      label: 'Amount',
      className: styles.amountCell,
      headerClassName: styles.amountHeader,
      render: (_value, row) =>
        row.amount ? (
          <span className={styles.amount}>
            {formatAmount(row.amount)}
            {row.assetCode ? <span className={styles.asset}> {row.assetCode}</span> : null}
          </span>
        ) : (
          <span className={styles.muted}>
            <span aria-hidden="true">-</span>
            <span className="sr-only">No amount</span>
          </span>
        ),
    },
    {
      key: 'date',
      label: 'Date',
      render: (_value, row) => (
        <time className={styles.date} dateTime={row.date}>
          {formatDate(row.date)}
        </time>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_value, row) => {
        const { label, variant } = STATUS_META[row.status] ?? STATUS_META.recorded;
        return (
          <Badge variant={variant} size="sm">
            {label}
          </Badge>
        );
      },
    },
  ];

  return (
    <Table<Row>
      columns={columns}
      data={transactions as Row[]}
      ariaLabel={ariaLabel}
      emptyMessage="No transactions yet. Activity in this community will appear here."
    />
  );
}
