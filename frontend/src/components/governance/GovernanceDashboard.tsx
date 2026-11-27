'use client';

import styles from '@/app/governance/governance.module.css';

export interface GovernanceDashboardProps {
  communityId?: string;
}

export function GovernanceDashboard({ communityId }: GovernanceDashboardProps) {
  if (!communityId) {
    return null;
  }

  return (
    <section className={styles.panel} aria-label="Governance overview">
      <header className={styles.proposalHeader}>
        <div>
          <p className={styles.eyebrow}>Governance Dashboard</p>
          <h2>Community Overview</h2>
        </div>
      </header>
      <div className={styles.feedback}>
        <p>Community: {communityId}</p>
      </div>
    </section>
  );
}

export default GovernanceDashboard;
