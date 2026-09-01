'use client';

import { useState } from 'react';
import { useLoans, type LoanStatus } from '@/hooks/useLoans';
import type { Community } from '@/hooks/useCommunities';
import { LoanCard } from './LoanCard';
import styles from './Dashboard.module.css';

interface Props {
  communities?: Community[];
}

const STATUSES: LoanStatus[] = ['pending', 'active', 'repaid', 'defaulted', 'cancelled'];

export function LoansSection({ communities = [] }: Props) {
  const [status, setStatus] = useState<LoanStatus | ''>('');
  const [communityId, setCommunityId] = useState('');

  const {
    data: loans,
    error,
    isLoading,
  } = useLoans({
    status: status || undefined,
    communityId: communityId || undefined,
  });

  return (
    <section>
      <div className={styles.sectionHeader}>
        <h2>Recent Loans</h2>
        <span className={styles.count}>{loans?.length ?? 0} shown</span>
      </div>

      <div className={styles.filterBar}>
        <select
          className={styles.filter}
          value={status}
          onChange={(e) => setStatus(e.target.value as LoanStatus | '')}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {communities.length > 0 && (
          <select
            className={styles.filter}
            value={communityId}
            onChange={(e) => setCommunityId(e.target.value)}
            aria-label="Filter by community"
          >
            <option value="">All communities</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && <div className={styles.state}>Loading loans…</div>}

      {error && <div className={`${styles.state} ${styles.error}`}>Could not load loans.</div>}

      {!isLoading && !error && loans?.length === 0 && (
        <div className={styles.state}>No loans match these filters.</div>
      )}

      <div className={styles.grid}>
        {loans?.map((loan) => (
          <LoanCard key={loan.id} loan={loan} />
        ))}
      </div>
    </section>
  );
}
