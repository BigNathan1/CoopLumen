'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import styles from './governance.module.css';
import { sanitizeUserText } from '@/lib/sanitize';
import { VotingPanel } from '@/components/governance/VotingPanel';
import { CreateProposalForm } from '@/components/governance/CreateProposalForm';
import ProposalList from '@/components/governance/ProposalList';
import ProposalDetail from '@/components/governance/ProposalDetail';

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

async function signVoteXdr(xdr: string): Promise<string> {
  const { signTransaction } = await import('@stellar/freighter-api');
  const res = await signTransaction(xdr);
  if (typeof res === 'string') return res;
  if (res && 'signedTxXdr' in res && res.signedTxXdr) return res.signedTxXdr;
  throw new Error('Signing failed');
}

export function GovernanceWorkspace({
  initialCommunityId,
  communityId: propCommunityId,
}: {
  initialCommunityId?: string;
  communityId?: string;
}) {
  const [communityId] = useState(propCommunityId ?? initialCommunityId ?? '');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [voting, setVoting] = useState<VoteChoice | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function castVote(choice: VoteChoice) {
    if (!proposal) return;
    setVoting(choice);
    setMessage('');
    setError('');

    try {
      // Votes are cast on-chain: the client builds and signs the vote XDR,
      // then submits it to the proposal vote endpoint.
      const { xdr } = await api.post<{ xdr: string }>(
        `/api/v1/proposals/${proposal.id}/vote/build`,
        { choice }
      );
      const signedXdr = await signVoteXdr(xdr);
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

        <CreateProposalForm
          communityId={communityId}
          onCreated={(created) => {
            setProposal(created as unknown as Proposal);
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

            <ProposalDetail proposalId={proposal.id} />
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
