'use client';

import { useMemo } from 'react';
import { useProposal } from '../../hooks/useProposal';
import styles from './ProposalDetail.module.css';

export interface ProposalDetailProps {
  proposalId: string;
}

type VoteKey = 'for' | 'against' | 'abstain';

interface VoteTally {
  for: number;
  against: number;
  abstain: number;
}

const VOTE_LABELS: Record<VoteKey, string> = {
  for: 'For',
  against: 'Against',
  abstain: 'Abstain',
};

const VOTE_ORDER: VoteKey[] = ['for', 'against', 'abstain'];

const TALLY_BAR_CLASS: Record<VoteKey, string> = {
  for: styles.tallyBarFor ?? '',
  against: styles.tallyBarAgainst ?? '',
  abstain: styles.tallyBarAbstain ?? '',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function statusClassName(status: string | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'active':
    case 'open':
      return styles.statusActive;
    case 'passed':
    case 'executed':
      return styles.statusPassed;
    case 'rejected':
    case 'cancelled':
      return styles.statusRejected;
    default:
      return styles.statusPending;
  }
}

/** One proposal with its live, token-weighted vote tally. */
export function ProposalDetail({ proposalId }: ProposalDetailProps) {
  const { data: proposal, isLoading, error, mutate } = useProposal(proposalId);

  const tally = useMemo<VoteTally>(
    () => ({
      for: Math.max(0, Number(proposal?.tally?.for ?? 0) || 0),
      against: Math.max(0, Number(proposal?.tally?.against ?? 0) || 0),
      abstain: Math.max(0, Number(proposal?.tally?.abstain ?? 0) || 0),
    }),
    [proposal]
  );

  const totalVotes = tally.for + tally.against + tally.abstain;

  const percentages = useMemo<Record<VoteKey, number>>(() => {
    if (totalVotes <= 0) return { for: 0, against: 0, abstain: 0 };
    return {
      for: (tally.for / totalVotes) * 100,
      against: (tally.against / totalVotes) * 100,
      abstain: (tally.abstain / totalVotes) * 100,
    };
  }, [tally, totalVotes]);

  const chartSummary = useMemo(() => {
    if (totalVotes <= 0) return 'Vote tally: no votes have been cast yet.';
    const parts = VOTE_ORDER.map(
      (key) =>
        `${VOTE_LABELS[key]} ${formatNumber(tally[key])} votes (${percentages[key].toFixed(1)}%)`
    );
    return `Vote tally out of ${formatNumber(totalVotes)} total votes: ${parts.join(', ')}.`;
  }, [tally, percentages, totalVotes]);

  if (isLoading) {
    return (
      <section className={styles.panel} aria-busy="true" aria-live="polite">
        <p className={styles.empty}>Loading proposal…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.panel} role="alert">
        <p className={styles.empty}>
          Unable to load this proposal. {error instanceof Error ? error.message : ''}
        </p>
        <button type="button" className={styles.button} onClick={() => void mutate()}>
          Retry
        </button>
      </section>
    );
  }

  if (!proposal) {
    return (
      <section className={styles.panel}>
        <p className={styles.empty}>Proposal not found.</p>
      </section>
    );
  }

  return (
    <article className={styles.panel} aria-labelledby="proposal-detail-title">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 id="proposal-detail-title" className={styles.title}>
            {proposal.title}
          </h1>
          <span className={`${styles.statusBadge} ${statusClassName(proposal.status)}`}>
            {proposal.status}
          </span>
        </div>

        <dl className={styles.meta}>
          <div className={styles.metaItem}>
            <dt>Voting opens</dt>
            <dd>{formatDate(proposal.voting_starts_at)}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt>Voting closes</dt>
            <dd>{formatDate(proposal.voting_ends_at)}</dd>
          </div>
        </dl>
      </header>

      {proposal.description && <p className={styles.description}>{proposal.description}</p>}

      <section className={styles.tallySection} aria-labelledby="proposal-tally-heading">
        <h2 id="proposal-tally-heading" className={styles.tallyHeading}>
          Vote tally
        </h2>

        {totalVotes <= 0 ? (
          <p className={styles.empty}>No votes have been cast yet.</p>
        ) : (
          <>
            <div className={styles.tallyList} role="img" aria-label={chartSummary}>
              {VOTE_ORDER.map((key) => (
                <div key={key} className={styles.tallyRow}>
                  <span className={styles.tallyLabel}>{VOTE_LABELS[key]}</span>
                  <div className={styles.tallyTrack}>
                    <div
                      className={`${styles.tallyBar} ${TALLY_BAR_CLASS[key]}`}
                      style={{ width: `${percentages[key]}%` }}
                    />
                  </div>
                  <span className={styles.tallyValue}>
                    {formatNumber(tally[key])}{' '}
                    <span className={styles.tallyPercent}>({percentages[key].toFixed(1)}%)</span>
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.totalRow}>
              <span>Total</span>
              <span className={styles.totalValue}>{formatNumber(totalVotes)}</span>
            </div>
          </>
        )}
      </section>
    </article>
  );
}

export default ProposalDetail;
