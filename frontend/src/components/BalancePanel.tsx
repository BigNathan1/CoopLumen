'use client';

import { useBalances } from '@/hooks/useBalances';
import styles from './BalancePanel.module.css';

interface Props {
  publicKey: string;
}

export function BalancePanel({ publicKey }: Props) {
  const { data: balances, error, isLoading } = useBalances(publicKey);

  if (isLoading) {
    return <div className={styles.state}>Loading balances…</div>;
  }

  if (error) {
    return <div className={`${styles.state} ${styles.error}`}>Failed to load balances</div>;
  }

  if (!balances?.length) {
    return <div className={styles.state}>No balances found</div>;
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Your Balances</h3>
      <ul className={styles.list}>
        {balances.map((b, i) => (
          <li key={i} className={styles.item}>
            <span className={styles.asset}>{b.asset_type === 'native' ? 'XLM' : b.asset_code}</span>
            <span className={styles.amount}>
              {parseFloat(b.balance).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
