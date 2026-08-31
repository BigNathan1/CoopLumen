'use client';

import { useBalances } from '@/hooks/useBalances';
import styles from './BalancePanel.module.css';

interface Props {
  publicKey: string;
}

export function BalancePanel({ publicKey }: Props) {
  const { data: balances, error, isLoading, isValidating, mutate } = useBalances(publicKey);

  const handleRefresh = () => {
    void mutate();
  };

  const refreshButton = (
    <button
      type="button"
      className={styles.refreshButton}
      onClick={handleRefresh}
      disabled={isValidating}
      aria-label={isValidating ? 'Refreshing balances…' : 'Refresh balances'}
    >
      <span
        className={`${styles.refreshIcon} ${isValidating ? styles.spinning : ''}`}
        aria-hidden="true"
      >
        ⟳
      </span>
    </button>
  );

  if (isLoading) {
    return (
      <div className={styles.state} role="status" aria-live="polite">
        Loading balances…
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={`${styles.state} ${styles.error}`} role="alert">
            Failed to load balances
          </div>
          {refreshButton}
        </div>
      </div>
    );
  }

  if (!balances?.length) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.state} role="status">
            No balances found
          </div>
          {refreshButton}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Your Balances</h3>
        {refreshButton}
      </div>
      <ul className={styles.list}>
        {balances.map((b) => {
          const asset = b.asset_type === 'native' ? 'XLM' : (b.asset_code ?? 'Unknown asset');
          return (
            <li key={`${asset}:${b.asset_issuer ?? 'native'}`} className={styles.item}>
              <span className={styles.asset}>{asset}</span>
              <span className={styles.amount}>
                {parseFloat(b.balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 7,
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
