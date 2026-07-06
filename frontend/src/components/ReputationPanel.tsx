'use client';

import { useReputation } from '@/hooks/useReputation';
import styles from './ReputationPanel.module.css';

interface Props {
  communityId?: string;
}

/** Shortens a Stellar address to `GABC…WXYZ` for compact display. */
function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

export function ReputationPanel({ communityId }: Props) {
  const { data: scores, error, isLoading } = useReputation(communityId);

  if (isLoading) {
    return <div className={styles.state}>Loading reputation…</div>;
  }

  if (error) {
    return <div className={`${styles.state} ${styles.error}`}>Failed to load reputation</div>;
  }

  if (!scores?.length) {
    return <div className={styles.state}>No reputation scores yet</div>;
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Reputation Leaderboard</h3>
      <ol className={styles.list}>
        {scores.map((s, i) => (
          <li key={s.id} className={styles.item}>
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.address} title={s.stellar_address}>
              {shortAddress(s.stellar_address)}
            </span>
            <span className={styles.detail}>
              {s.on_time_repayments}✓ / {s.defaults}✗
            </span>
            <span className={styles.score}>{parseFloat(s.score).toFixed(0)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
