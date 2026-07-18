'use client';

import { useLoan, type LoanEvent } from '@/hooks/useLoans';
import styles from './LoanHistory.module.css';

interface Props {
  loanId: string;
}

const EVENT_LABEL: Record<LoanEvent['event_type'], string> = {
  created: 'Created',
  disbursed: 'Disbursed',
  repayment: 'Repayment',
  closed: 'Closed',
  defaulted: 'Defaulted',
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function LoanHistory({ loanId }: Props) {
  const { data, error, isLoading } = useLoan(loanId);

  if (isLoading) {
    return <div className={styles.state}>Loading history…</div>;
  }

  if (error || !data) {
    return <div className={`${styles.state} ${styles.error}`}>Could not load history</div>;
  }

  return (
    <ol className={styles.timeline}>
      {data.events.map((event) => (
        <li key={event.id} className={styles.event}>
          <span className={styles.type}>{EVENT_LABEL[event.event_type] ?? event.event_type}</span>
          {event.amount && <span className={styles.amount}>{event.amount}</span>}
          {event.note && <span className={styles.note}>{event.note}</span>}
          <span className={styles.time}>{formatTimestamp(event.created_at)}</span>
        </li>
      ))}
    </ol>
  );
}
