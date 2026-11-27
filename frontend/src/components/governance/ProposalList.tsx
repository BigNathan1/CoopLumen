'use client';

import { useMemo, useState } from 'react';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { useProposals } from '@/hooks/useProposals';
import type { Proposal, ProposalStatus } from '@/hooks/useProposal';
import styles from './ProposalList.module.css';

type TabKey = 'open' | 'passed' | 'rejected' | 'executed';

interface TabDefinition {
  key: TabKey;
  label: string;
  status: ProposalStatus;
}

const TABS: TabDefinition[] = [
  { key: 'open', label: 'Open', status: 'active' },
  { key: 'passed', label: 'Passed', status: 'passed' },
  { key: 'rejected', label: 'Rejected', status: 'rejected' },
  { key: 'executed', label: 'Executed', status: 'executed' },
];

const STATUS_BADGE_VARIANT: Record<ProposalStatus, BadgeVariant> = {
  draft: 'neutral',
  active: 'info',
  passed: 'success',
  rejected: 'error',
  executed: 'neutral',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Draft',
  active: 'Open',
  passed: 'Passed',
  rejected: 'Rejected',
  executed: 'Executed',
  cancelled: 'Cancelled',
};

const TAB_BADGE_CLASS: Record<TabKey, string> = {
  open: styles.badgeOpen,
  passed: styles.badgePassed,
  rejected: styles.badgeRejected,
  executed: styles.badgeExecuted,
};

export interface ProposalListProps {
  communityId: string;
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatWeight(value: string | undefined): string {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return '0';
  return asNumber.toLocaleString();
}

/**
 * A community's proposals, grouped into the lifecycle buckets a voter cares
 * about. Filtering is client-side over the single `useProposals` response so
 * switching tabs never triggers another request.
 */
export function ProposalList({ communityId }: ProposalListProps) {
  const { data: proposals, isLoading, error } = useProposals(communityId);
  const [activeTab, setActiveTab] = useState<TabKey>('open');

  const grouped = useMemo(() => {
    const buckets: Record<TabKey, Proposal[]> = {
      open: [],
      passed: [],
      rejected: [],
      executed: [],
    };
    for (const proposal of proposals ?? []) {
      const tab = TABS.find((candidate) => candidate.status === proposal.status);
      if (tab) buckets[tab.key].push(proposal);
    }
    return buckets;
  }, [proposals]);

  const counts: Record<TabKey, number> = {
    open: grouped.open.length,
    passed: grouped.passed.length,
    rejected: grouped.rejected.length,
    executed: grouped.executed.length,
  };

  const visible = grouped[activeTab];

  return (
    <section className={styles.container} aria-label="Community proposals">
      <div className={styles.tablist} role="tablist" aria-label="Proposal status">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`proposal-tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`proposal-panel-${tab.key}`}
            className={styles.tab}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span className={styles.tabCount}>{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      <div
        className={styles.tabpanel}
        role="tabpanel"
        id={`proposal-panel-${activeTab}`}
        aria-labelledby={`proposal-tab-${activeTab}`}
      >
        {isLoading && (
          <div role="status" aria-live="polite">
            <LoadingSkeleton variant="text" count={3} label="Loading proposals" />
          </div>
        )}

        {!isLoading && Boolean(error) && (
          <p className={styles.error} role="alert">
            Could not load proposals. Please try again.
          </p>
        )}

        {!isLoading && !error && visible.length === 0 && (
          <EmptyState
            title={`No ${activeTab} proposals`}
            message="There are no proposals in this state yet."
          />
        )}

        {!isLoading && !error && visible.length > 0 && (
          <ul className={styles.list}>
            {visible.map((proposal) => (
              <li key={proposal.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{proposal.title}</h3>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[proposal.status]}
                    size="sm"
                    className={`${styles.badge} ${TAB_BADGE_CLASS[activeTab]}`}
                  >
                    {STATUS_LABEL[proposal.status]}
                  </Badge>
                </div>

                <p className={styles.cardMeta}>
                  Voting closes {formatDate(proposal.voting_ends_at)} ·{' '}
                  {formatWeight(proposal.total_weight)} votes cast
                </p>

                {proposal.description && (
                  <p className={styles.cardDescription}>{proposal.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default ProposalList;
