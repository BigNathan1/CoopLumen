'use client';

import { useLoans } from '@/hooks/useLoans';
import { LoanCard } from './LoanCard';
import styles from './Dashboard.module.css';

export function LoansSection() {
  const { data: loans, error, isLoading } = useLoans();

  return (
    <section>
      <div className={styles.sectionHeader}>
        <h2>Recent Loans</h2>
        <span className={styles.count}>{loans?.length ?? 0} shown</span>
      </div>

      {isLoading && <div className={styles.state}>Loading loans…</div>}

      {error && <div className={`${styles.state} ${styles.error}`}>Could not load loans.</div>}

      {!isLoading && !error && loans?.length === 0 && (
        <div className={styles.state}>No loans yet.</div>
      )}

      <div className={styles.grid}>
        {loans?.map((loan) => (
          <LoanCard key={loan.id} loan={loan} />
        ))}
      </div>
    </section>
  );
}
