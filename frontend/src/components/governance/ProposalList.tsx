import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useProposals } from '../../hooks/useProposals';
import type { Proposal, ProposalStatus } from '../../types/governance';
import Badge from '../ui/Badge';
import LoadingSkeleton from '../ui/LoadingSkeleton';
import EmptyState from '../ui/EmptyState';
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

const STATUS_BADGE_VARIANT: Record<
  ProposalStatus,
  'info' | 'success' | 'danger' | 'neutral'
> = {
  active: 'info',
  passed: 'success',
  rejected: 'danger',
  executed: 'neutral',
};

const STATUS_LABEL: Record<ProposalStatus, string> = {
  active: 'Open',
  passed: 'Passed',
  rejected: 'Rejected',
  executed: 'Executed',
};

export interface ProposalListProps {
  communityId: string;
}

function formatDate(value: string | number | Date | undefined): string {
  if (value === undefined || value === null) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatVotes(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0';
  }
  return value.toLocaleString();
}

export default function ProposalList({ communityId }: ProposalListProps) {
  const { proposals, isLoading, error } = useProposals(communityId);
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const baseId = useId();
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    open: null,
    passed: null,
    rejected: null,
    executed: null,
  });

  const proposalsByTab = useMemo(() => {
    const grouped: Record<TabKey, Proposal[]> = {
      open: [],
      passed: [],
      rejected: [],
      executed: [],
    };
    if (!proposals) {
      return grouped;
    }
    for (const proposal of proposals) {
      const tab = TABS.find((t) => t.status === proposal.status);
      if (tab) {
        grouped[tab.key].push(proposal);
      }
    }
    return grouped;
  }, [proposals]);

  const focusTab = useCallback((key: TabKey) => {
    const el = tabRefs.current[key];
    if (el) {
      el.focus();
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      switch (event.key) {
        case 'ArrowRight':
          nextIndex = (index + 1) % TABS.length;
          break;
        case 'ArrowLeft':
          nextIndex = (index - 1 + TABS.length) % TABS.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = TABS.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const nextTab = TABS[nextIndex];
      setActiveTab(nextTab.key);
      focusTab(nextTab.key);
    },
    [focusTab],
  );

  const activeDefinition = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const activeProposals = proposalsByTab[activeDefinition.key];

  return (
    <section className={styles.container} aria-label="Proposals">
      <div className={styles.tablist} role="tablist" aria-label="Proposal status">
        {TABS.map((tab, index) => {
          const isSelected = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[tab.key] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.key}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${tab.key}`}
              tabIndex={isSelected ? 0 : -1}
              className={`${styles.tab} ${isSelected ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {tab.label}
              <span className={styles.tabCount} aria-hidden="true">
                {proposalsByTab[tab.key].length}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeDefinition.key}`}
        aria-labelledby={`${baseId}-tab-${activeDefinition.key}`}
        tabIndex={0}
        className={styles.panel}
      >
        {isLoading ? (
          <LoadingSkeleton variant="list" count={3} />
        ) : error ? (
          <EmptyState
            title="Unable to load proposals"
            description="Something went wrong while fetching proposals. Please try again."
          />
        ) : activeProposals.length === 0 ? (
          <EmptyState
            title={`No ${activeDefinition.label.toLowerCase()} proposals`}
            description={`There are currently no ${activeDefinition.label.toLowerCase()} proposals for this community.`}
          />
        ) : (
          <ul className={styles.list}>
            {activeProposals.map((proposal) => (
              <li key={proposal.id} className={styles.item}>
                <article className={styles.card}>
                  <header className={styles.cardHeader}>
                    <h3 className={styles.title}>{proposal.title}</h3>
                    <Badge variant={STATUS_BADGE_VARIANT[proposal.status]}>
                      {STATUS_LABEL[proposal.status]}
                    </Badge>
                  </header>
                  {proposal.description ? (
                    <p className={styles.description}>{proposal.description}</p>
                  ) : null}
                  <dl className={styles.meta}>
                    <div className={styles.metaItem}>
                      <dt className={styles.metaLabel}>For</dt>
                      <dd className={styles.metaValue}>
                        {formatVotes(proposal.votesFor)}
                      </dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt className={styles.metaLabel}>Against</dt>
                      <dd className={styles.metaValue}>
                        {formatVotes(proposal.votesAgainst)}
                      </dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt className={styles.metaLabel}>Voting ends</dt>
                      <dd className={styles.metaValue}>
                        <time dateTime={String(proposal.votingEndsAt ?? '')}>
                          {formatDate(proposal.votingEndsAt)}
                        </time>
                      </dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}