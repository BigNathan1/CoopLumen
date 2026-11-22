'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import styles from './governance.module.css';
import { sanitizeUserText } from '@/lib/sanitize';
import { VotingPanel } from '@/components/governance/VotingPanel';

type VoteChoice = 'for' | 'against' | 'abstain';

interface Proposal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  votes_for: string;
  votes_against: string;
  votes_abstain: string;
  total_weight: string;
  voting_ends_at: string;
}

export function GovernanceWorkspace({ initialCommunityId }: { initialCommunityId: string }) {
  const [communityId, setCommunityId] = useState(initialCommunityId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function createProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    setError('');

    try {
      const created = await api.post<Proposal>('/api/v1/proposals', {
        communityId,
        title,
        description: description || undefined,
        type: 'general',
        quorumPercent: 50,
        votingDurationHours: 24,
      });
      setProposal(created);
      setMessage('Proposal created and voting is open.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the proposal.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleVoteRecorded(updated: Proposal) {
    setProposal(updated);
    setMessage('Vote recorded.');
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Community governance</p>
          <h1>Create a proposal</h1>
          <p>Open a ballot for an existing CoopLumen community.</p>
        </header>

        <section className={styles.panel} aria-labelledby="proposal-form-title">
          <h2 id="proposal-form-title">Proposal details</h2>
          <form className={styles.form} onSubmit={createProposal}>
            <label>
              Community ID
              <input
                name="communityId"
                value={communityId}
                onChange={(event) => setCommunityId(event.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label>
              Title
              <input
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={10_000}
                rows={4}
              />
            </label>
            <button className={styles.primaryButton} type="submit" disabled={submitting}>
              {submitting ? 'Creating proposal...' : 'Create proposal'}
            </button>
          </form>
        </section>

        {proposal && (
          <section className={styles.panel} aria-labelledby="active-proposal-title">
            <div className={styles.proposalHeader}>
              <div>
                <p className={styles.eyebrow}>Active ballot</p>
                <h2 id="active-proposal-title">{sanitizeUserText(proposal.title)}</h2>
              </div>
              <span className={styles.status}>{proposal.status}</span>
            </div>
            {proposal.description && (
              <p className={styles.description}>{sanitizeUserText(proposal.description)}</p>
            )}

            <VotingPanel
              proposalId={proposal.id}
              tally={{
                votes_for: proposal.votes_for,
                votes_against: proposal.votes_against,
                votes_abstain: proposal.votes_abstain,
                total_weight: proposal.total_weight,
              }}
              status={proposal.status}
              onVoteRecorded={handleVoteRecorded}
            />
          </section>
        )}

        <div className={styles.feedback} aria-live="polite">
          {message && <p className={styles.success}>{message}</p>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
