'use client';

import { useState } from 'react';
import { useLoans, type LoanStatus } from '@/hooks/useLoans';
import type { Community } from '@/hooks/useCommunities';
import { LoanCard } from './LoanCard';
import { Button } from '@/components/ui/Button';
import styles from './LoanList.module.css';

const TAB_STATUSES: { value: LoanStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'repaid', label: 'Closed' },
  { value: 'defaulted', label: 'Defaulted' },
];

export interface LoanListProps {
  communities?: Community[];
}

export function LoanList({ communities = [] }: LoanListProps) {
  const [status, setStatus] = useState<LoanStatus | ''>('');
  const [communityId, setCommunityId] = useState('');

  const { data: loans, error, isLoading } = useLoans({
    status: status || undefined,
    communityId: communityId || undefined,
  });

  return (
    <section className={styles.container} aria-labelledby="loan-list-title">
      <header className={styles.header}>
        <h2 id="loan-list-title" className={styles.title}>Loans</h2>
        <span className={styles.count}>{loans?.length ?? 0} shown</span>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Filter loans by status">
        {TAB_STATUSES.map((tab) => (
          <Button
            key={tab.value}
            role="tab"
            aria-selected={status === tab.value}
            aria-controls={`panel-${tab.value || 'all'}`}
            id={`tab-${tab.value || 'all'}`}
            variant={status === tab.value ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setStatus(tab.value)}
            className={styles.tab}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className={styles.filterBar}>
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

      {isLoading && (
        <div className={styles.state} role="status" aria-live="polite">
          Loading loans…
        </div>
      )}

      {error && (
        <div className={`${styles.state} ${styles.error}`} role="alert">
          Could not load loans.
        </div>
      )}

      {!isLoading && !error && loans?.length === 0 && (
        <div className={styles.state}>No loans match these filters.</div>
      )}

      <div
        id={`panel-${status || 'all'}`}
        role="tabpanel"
        aria-labelledby={`tab-${status || 'all'}`}
        className={styles.grid}
      >
        {loans?.map((loan) => (
          <LoanCard key={loan.id} loan={loan} />
        ))}
      </div>
    </section>
  );
}