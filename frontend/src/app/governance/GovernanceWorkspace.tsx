'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { sanitizeUserText } from '@/lib/sanitize';
import { useFreighterSign } from '@/hooks/useFreighterSign';
import type { Proposal } from '@/hooks/useProposal';
import { CreateProposalForm } from '@/components/governance/CreateProposalForm';
import { ProposalList } from '@/components/governance/ProposalList';
import styles from './governance.module.css';

type VoteChoice = 'for' | 'against' | 'abstain';

/**
 * Creates proposals for a community and casts token-weighted votes on the
 * selected ballot. Votes are built by the API, signed in Freighter, and
 * submitted back as a signed envelope.
 */
export function GovernanceWorkspace({ initialCommunityId }: { initialCommunityId: string }) {
  const [communityId] = useState(initialCommunityId);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [voting, setVoting] = useState<VoteChoice | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { sign } = useFreighterSign();

  async function castVote(choice: VoteChoice) {
    if (!proposal) return;
    setVoting(choice);
    setMessage('');
    setError('');

    try {
      const { xdr } = await api.post<{ xdr: string }>(
        `/api/v1/proposals/${proposal.id}/vote/build`,
        { choice }
      );
      const signedXdr = await sign(xdr);
      const updated = await api.post<Proposal>(`/api/v1/proposals/${proposal.id}/vote`, {
        signedXdr,
      });
      setProposal(updated);
      setMessage('Vote recorded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record the vote.');
    } finally {
      setVoting(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Community governance</p>
          <h1>Create a proposal</h1>
          <p>Open a ballot for an existing CoopLumen community.</p>
        </header>

        <CreateProposalForm
          communityId={communityId}
          onCreated={(created) => {
            setProposal(created as Proposal);
            setMessage('Proposal created and voting is open.');
            setError('');
          }}
        />

        <ProposalList communityId={communityId} />

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

            <dl className={styles.tally} aria-label="Live vote tally">
              <div>
                <dt>For</dt>
                <dd data-testid="votes-for">{proposal.votes_for}</dd>
              </div>
              <div>
                <dt>Against</dt>
                <dd>{proposal.votes_against}</dd>
              </div>
              <div>
                <dt>Abstain</dt>
                <dd>{proposal.votes_abstain}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{proposal.total_weight}</dd>
              </div>
            </dl>

            <fieldset className={styles.voteGroup} disabled={voting !== null}>
              <legend>Cast your vote</legend>
              <div className={styles.voteActions}>
                <button type="button" onClick={() => castVote('for')}>
                  Vote for
                </button>
                <button type="button" onClick={() => castVote('against')}>
                  Vote against
                </button>
                <button type="button" onClick={() => castVote('abstain')}>
                  Abstain
                </button>
              </div>
            </fieldset>
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
