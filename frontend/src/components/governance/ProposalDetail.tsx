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

function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function normalizeTally(tally: any): VoteTally {
  return {
    for: Math.max(0, Number(tally?.for ?? tally?.votesFor ?? tally?.votes_for) || 0),
    against: Math.max(
      0,
      Number(tally?.against ?? tally?.votesAgainst ?? tally?.votes_against) || 0
    ),
    abstain: Math.max(
      0,
      Number(tally?.abstain ?? tally?.votesAbstain ?? tally?.votes_abstain) || 0
    ),
  };
}

function statusClassName(status: string | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'active':
    case 'open':
      return styles.statusActive;
    case 'passed':
    case 'succeeded':
    case 'executed':
      return styles.statusPassed;
    case 'rejected':
    case 'failed':
    case 'defeated':
      return styles.statusRejected;
    default:
      return styles.statusNeutral;
  }
}

export function ProposalDetail({ proposalId }: ProposalDetailProps) {
  const hookResult = useProposal(proposalId) as any;
  const proposal = (hookResult?.data ?? hookResult?.proposal) as any;
  const isLoading = Boolean(hookResult?.isLoading ?? hookResult?.loading);
  const error = hookResult?.error ?? null;
  const refetch = (hookResult?.mutate ?? hookResult?.refetch) as () => void;

  const tally = useMemo<VoteTally>(
    () => normalizeTally(proposal?.tally ?? proposal?.votes ?? proposal),
    [proposal]
  );

  const totalVotes = tally.for + tally.against + tally.abstain;

  const percentages = useMemo<Record<VoteKey, number>>(() => {
    if (totalVotes <= 0) {
      return { for: 0, against: 0, abstain: 0 };
    }
    return {
      for: (tally.for / totalVotes) * 100,
      against: (tally.against / totalVotes) * 100,
      abstain: (tally.abstain / totalVotes) * 100,
    };
  }, [tally, totalVotes]);

  const chartSummary = useMemo(() => {
    if (totalVotes <= 0) {
      return 'Vote tally: no votes have been cast yet.';
    }
    const parts = VOTE_ORDER.map(
      (key) =>
        `${VOTE_LABELS[key]} ${formatNumber(tally[key])} votes (${percentages[key].toFixed(1)}%)`
    );
    return `Vote tally out of ${formatNumber(totalVotes)} total votes: ${parts.join(', ')}.`;
  }, [tally, percentages, totalVotes]);

  if (isLoading) {
    return (
      <section className={styles.container} role="status" aria-busy="true" aria-live="polite">
        <p className={styles.stateMessage}>Loading proposal…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.container} role="alert">
        <p className={styles.stateMessage}>
          Unable to load this proposal. {error instanceof Error ? error.message : ''}
        </p>
        {typeof refetch === 'function' && (
          <button type="button" className={styles.retryButton} onClick={() => refetch()}>
            Retry
          </button>
        )}
      </section>
    );
  }

  if (!proposal) {
    return (
      <section className={styles.container}>
        <p className={styles.stateMessage}>Proposal not found.</p>
      </section>
    );
  }

  const status = proposal.status ?? 'unknown';

  return (
    <article
      className={styles.container}
      role="region"
      aria-label="Proposal detail"
      aria-labelledby="proposal-detail-title"
    >
      <header className={styles.header}>
        <h1 id="proposal-detail-title" className={styles.title}>
          {proposal.title}
        </h1>
        <span className={`${styles.statusBadge} ${statusClassName(status)}`}>{status}</span>
      </header>

      {proposal.description && <p className={styles.description}>{proposal.description}</p>}

      <dl className={styles.meta}>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Voting opens</dt>
          <dd className={styles.metaValue}>
            {formatDate(proposal?.startTime ?? proposal?.voting_starts_at)}
          </dd>
        </div>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Voting closes</dt>
          <dd className={styles.metaValue}>
            {formatDate(proposal?.endTime ?? proposal?.voting_ends_at)}
          </dd>
        </div>
      </dl>

      <section className={styles.tallySection} aria-labelledby="proposal-tally-heading">
        <h2 id="proposal-tally-heading" className={styles.sectionHeading}>
          Vote tally
        </h2>

        {totalVotes <= 0 ? (
          <p className={styles.stateMessage}>No votes have been cast yet.</p>
        ) : (
          <>
            <div className={styles.chart} role="img" aria-label={chartSummary}>
              {VOTE_ORDER.map((key) => (
                <div key={key} className={styles.barRow}>
                  <span className={styles.barLabel} aria-hidden="true">
                    {VOTE_LABELS[key]}
                  </span>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.barFill} ${styles[`bar${key.charAt(0).toUpperCase()}${key.slice(1)}`]}`}
                      style={{ width: `${percentages[key]}%` }}
                      tabIndex={0}
                      role="progressbar"
                      aria-label={`${VOTE_LABELS[key]}: ${Math.round(percentages[key])}%`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(percentages[key])}
                      aria-valuetext={`${VOTE_LABELS[key]}: ${formatNumber(tally[key])} votes, ${percentages[key].toFixed(1)} percent`}
                    />
                  </div>
                  <span className={styles.barValue} aria-hidden="true">
                    {formatNumber(tally[key])} (
                    {percentages[key] % 1 === 0
                      ? `${percentages[key]}%`
                      : `${percentages[key].toFixed(1)}%`}
                    )
                  </span>
                </div>
              ))}
            </div>

            <table className={styles.tallyTable}>
              <caption className={styles.visuallyHidden}>Vote tally for {proposal.title}</caption>
              <thead>
                <tr>
                  <th scope="col">Option</th>
                  <th scope="col">Votes</th>
                  <th scope="col">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {VOTE_ORDER.map((key) => (
                  <tr key={key}>
                    <th scope="row">{VOTE_LABELS[key]}</th>
                    <td>{formatNumber(tally[key])}</td>
                    <td>
                      {percentages[key] % 1 === 0
                        ? `${percentages[key]}%`
                        : `${percentages[key].toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <th scope="row">Total</th>
                  <td>{formatNumber(totalVotes)}</td>
                  <td>100%</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </section>
    </article>
  );
}

export default ProposalDetail;
