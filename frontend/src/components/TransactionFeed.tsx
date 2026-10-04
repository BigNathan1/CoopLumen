'use client';

import { useTranslation } from '@/hooks/useLocale';
import { useTransactions, type StreamedPayment } from '@/hooks/useTransactions';
import styles from './TransactionFeed.module.css';

/** Translation key for each connection state the stream can report. */
const STATUS_KEYS = {
  idle: 'transactions.offline',
  connecting: 'transactions.connecting',
  live: 'transactions.live',
  reconnecting: 'transactions.reconnecting',
  closed: 'transactions.offline',
} as const;

/** The asset a payment moved: native means XLM, anything else carries a code. */
function readAsset(payment: StreamedPayment): string {
  if (payment.asset_type === 'native') return 'XLM';
  return typeof payment.asset_code === 'string' ? payment.asset_code : '—';
}

/** The amount as the ledger wrote it, so no precision is invented client-side. */
function readAmount(payment: StreamedPayment): string {
  return typeof payment.amount === 'string' ? payment.amount : '';
}

export interface TransactionFeedProps {
  /** The account to follow, or `null` to show the idle state. */
  publicKey: string | null;
  className?: string;
}

/**
 * A live, newest-first feed of the payments touching an account, backed by
 * `useTransactions` and the backend SSE endpoint.
 *
 * Every string comes from the active catalog, including the connection status,
 * so the panel reads correctly in each language the app ships. The newest
 * payment is also announced through a polite live region — a list that grows on
 * its own is otherwise silent to a screen reader.
 */
export function TransactionFeed({ publicKey, className }: TransactionFeedProps) {
  const { t } = useTranslation();
  const { transactions, status, error } = useTransactions({ publicKey });

  const latest = transactions[0] ?? null;

  return (
    <section
      className={[styles.panel, className].filter(Boolean).join(' ')}
      aria-label={t('dashboard.recentTransactions')}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{t('dashboard.recentTransactions')}</h3>
        <span className={`${styles.status} ${styles[status]}`}>{t(STATUS_KEYS[status])}</span>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}

      {transactions.length === 0 ? (
        <p className={styles.state}>{t('dashboard.noTransactions')}</p>
      ) : (
        <ul className={styles.list}>
          {transactions.map((payment) => (
            <li key={payment.id} className={styles.item}>
              <span className={styles.direction}>
                {payment.to === publicKey ? t('transactions.received') : t('transactions.sent')}
              </span>
              <span className={styles.amount}>
                {readAmount(payment)} {readAsset(payment)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <span role="status" aria-live="polite" className={styles.announcement}>
        {latest
          ? t('transactions.newPayment', { amount: readAmount(latest), asset: readAsset(latest) })
          : ''}
      </span>
    </section>
  );
}
