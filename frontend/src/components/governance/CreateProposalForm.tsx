'use client';

import { useCallback, useId, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import styles from './CreateProposalForm.module.css';

export type ProposalType =
  | 'general'
  | 'loan_approval'
  | 'member_removal'
  | 'treasury_spend'
  | 'settings_change'
  | 'token_issuance';

export interface CreateProposalPayload {
  communityId: string;
  title: string;
  description?: string;
  type: ProposalType;
  quorumPercent: number;
  votingDurationHours: number;
}

export interface CreateProposalFormProps {
  communityId: string;
  onCreated?: (proposal: unknown) => void;
  onCancel?: () => void;
}

const PROPOSAL_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'treasury_spend', label: 'Treasury spend' },
  { value: 'loan_approval', label: 'Loan approval' },
  { value: 'member_removal', label: 'Member removal' },
  { value: 'settings_change', label: 'Settings change' },
  { value: 'token_issuance', label: 'Token issuance' },
];

/**
 * Creates a community proposal. The payload matches `createProposalSchema` on
 * the backend, which owns the defaults for quorum and voting duration.
 */
export function CreateProposalForm({ communityId, onCreated, onCancel }: CreateProposalFormProps) {
  const formId = useId();
  const descriptionId = `${formId}-description`;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProposalType>('general');
  const [quorumPercent, setQuorumPercent] = useState('50');
  const [votingDurationHours, setVotingDurationHours] = useState('24');
  const [titleError, setTitleError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setTitleError('');
      setFormError('');

      if (title.trim().length === 0) {
        setTitleError('Title is required');
        return;
      }

      const payload: CreateProposalPayload = {
        communityId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        quorumPercent: Number(quorumPercent),
        votingDurationHours: Number(votingDurationHours),
      };

      setSubmitting(true);
      try {
        const response = await api.post('/api/v1/proposals', payload);
        onCreated?.(response);
        setTitle('');
        setDescription('');
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : 'Failed to create the proposal. Try again.'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [communityId, description, onCreated, quorumPercent, title, type, votingDurationHours]
  );

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${formId}-heading`}
    >
      <h2 id={`${formId}-heading`} className={styles.title}>
        Create proposal
      </h2>
      <p className={styles.subtitle}>
        Proposals are recorded on-chain once the community votes them through.
      </p>

      {formError && (
        <p className={styles.hint} role="alert">
          {formError}
        </p>
      )}

      <Input
        id={`${formId}-title`}
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        required
        error={titleError}
        placeholder="Short summary of the proposal"
      />

      <label className={styles.label} htmlFor={descriptionId}>
        Description
      </label>
      <textarea
        id={descriptionId}
        className={styles.textarea}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={10000}
        placeholder="What should change, and why?"
      />

      <Select
        label="Proposal type"
        options={PROPOSAL_TYPE_OPTIONS}
        value={type}
        onChange={(value) => setType(value as ProposalType)}
      />

      <Input
        id={`${formId}-quorum`}
        label="Quorum (%)"
        type="number"
        min={0}
        max={100}
        value={quorumPercent}
        onChange={(event) => setQuorumPercent(event.target.value)}
      />

      <Input
        id={`${formId}-duration`}
        label="Voting duration (hours)"
        type="number"
        min={1}
        max={720}
        value={votingDurationHours}
        onChange={(event) => setVotingDurationHours(event.target.value)}
      />

      <div className={styles.field}>
        <Button type="submit" isLoading={submitting} loadingLabel="Creating proposal">
          Create proposal
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default CreateProposalForm;
