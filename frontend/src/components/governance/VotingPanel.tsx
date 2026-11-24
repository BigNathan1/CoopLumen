'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import styles from '@/app/governance/governance.module.css';

export interface VoteTally {
  votes_for: string;
  votes_against: string;
  votes_abstain: string;
  total_weight: string;
}

export interface VotingPanelProps {
  proposalId: string;
  tally: VoteTally;
  status: string;
  onVoteRecorded?: (updated: any) => void;
}

export function VotingPanel({ proposalId, tally, status, onVoteRecorded }: VotingPanelProps) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canVote = status.toLowerCase() === 'active';

  async function handleVote(choice: 'for' | 'against' | 'abstain') {
    setSubmitting(choice);
    setMessage(null);
    setError(null);
    try {
      const res = await api.post(`/proposals/${proposalId}/votes`, { choice });
      setMessage('Vote recorded.');
      if (onVoteRecorded && res.data) {
        onVoteRecorded(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cast vote';
      setError(msg);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section className={styles.votingPanel} aria-labelledby="voting-panel-heading">
      <h2 id="voting-panel-heading">Cast Your Vote</h2>

      <dl className={styles.tallyGrid} aria-label="Vote tally">
        <div className={styles.tallyItem}>
          <dt>For</dt>
          <dd>{tally.votes_for}</dd>
        </div>
        <div className={styles.tallyItem}>
          <dt>Against</dt>
          <dd>{tally.votes_against}</dd>
        </div>
        <div className={styles.tallyItem}>
          <dt>Abstain</dt>
          <dd>{tally.votes_abstain}</dd>
        </div>
      </dl>

      <fieldset className={styles.voteGroup}>
        <legend>Select choice</legend>
        <div className={styles.voteActions}>
          <button
            type="button"
            className={styles.voteButton}
            data-vote="for"
            disabled={!canVote || submitting !== null}
            onClick={() => handleVote('for')}
          >
            Support
          </button>
          <button
            type="button"
            className={styles.voteButton}
            data-vote="against"
            disabled={!canVote || submitting !== null}
            onClick={() => handleVote('against')}
          >
            Oppose
          </button>
          <button
            type="button"
            className={styles.voteButton}
            data-vote="abstain"
            disabled={!canVote || submitting !== null}
            onClick={() => handleVote('abstain')}
          >
            Abstain
          </button>
        </div>
      </fieldset>

      <div className={styles.feedback} aria-live="polite">
        {message && <div className={styles.success}>{message}</div>}
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </section>
  );
}

export default VotingPanel;
