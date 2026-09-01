'use client';

import { useReputationDetail } from '@/hooks/useReputation';
import styles from './MyReputationPanel.module.css';

interface Props {
  address: string;
}

export function MyReputationPanel({ address }: Props) {
  const { data, error, isLoading } = useReputationDetail(address);

  if (isLoading) {
    return <div className={styles.state}>Loading your reputation…</div>;
  }

  // The API returns 404 for an address with no loan history yet.
  if (error || !data) {
    return (
      <div className={styles.state}>No reputation yet — take part in a loan to build one.</div>
    );
  }

  const { summary, communities } = data;

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Your Reputation</h3>

      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.value}>{summary.total_loans}</span>
          <span className={styles.tag}>loans</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.value} ${styles.good}`}>{summary.on_time_repayments}</span>
          <span className={styles.tag}>on time</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.value} ${styles.bad}`}>{summary.defaults}</span>
          <span className={styles.tag}>defaults</span>
        </div>
      </div>

      <ul className={styles.list}>
        {communities.map((c) => (
          <li key={c.id} className={styles.item}>
            <span className={styles.community} title={c.community_id}>
              {c.community_id.slice(0, 8)}…
            </span>
            <span className={styles.score}>{parseFloat(c.score).toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
