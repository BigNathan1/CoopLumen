'use client';

import { useCallback, useId, useState } from 'react';
import { api } from '../../lib/api';
import { createProposalFormSchema } from '../../lib/schemas';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import styles from './CreateProposalForm.module.css';

export type ProposalType = 'treasury' | 'parameter' | 'membership' | 'general';

export type ProposalActionType =
  | 'transfer'
  | 'mint'
  | 'burn'
  | 'set_parameter'
  | 'add_member'
  | 'remove_member';

export interface CreateProposalPayload {
  communityId: string;
  title: string;
  description: string;
  type: ProposalType;
  actions: Array<{ type: ProposalActionType; params: Record<string, string> }>;
}

export interface CreateProposalFormProps {
  communityId: string;
  onCreated?: (proposal: unknown) => void;
  onCancel?: () => void;
}

const PROPOSAL_TYPE_OPTIONS = [
  { value: 'treasury', label: 'Treasury' },
  { value: 'parameter', label: 'Parameter change' },
  { value: 'membership', label: 'Membership' },
  { value: 'general', label: 'General' },
];

const ACTION_TYPE_OPTIONS = [
  { value: 'transfer', label: 'Transfer tokens' },
  { value: 'mint', label: 'Mint tokens' },
  { value: 'burn', label: 'Burn tokens' },
  { value: 'set_parameter', label: 'Set parameter' },
  { value: 'add_member', label: 'Add member' },
  { value: 'remove_member', label: 'Remove member' },
];

interface ActionParamField {
  key: string;
  label: string;
  placeholder?: string;
}

const ACTION_PARAM_FIELDS: Record<ProposalActionType, ActionParamField[]> = {
  transfer: [
    { key: 'recipient', label: 'Recipient address', placeholder: 'G…' },
    { key: 'amount', label: 'Amount', placeholder: '0' },
  ],
  mint: [
    { key: 'recipient', label: 'Recipient address', placeholder: 'G…' },
    { key: 'amount', label: 'Amount', placeholder: '0' },
  ],
  burn: [
    { key: 'holder', label: 'Holder address', placeholder: 'G…' },
    { key: 'amount', label: 'Amount', placeholder: '0' },
  ],
  set_parameter: [
    { key: 'name', label: 'Parameter name', placeholder: 'quorum' },
    { key: 'value', label: 'Parameter value', placeholder: '0' },
  ],
  add_member: [{ key: 'member', label: 'Member address', placeholder: 'G…' }],
  remove_member: [{ key: 'member', label: 'Member address', placeholder: 'G…' }],
};

/**
 * Creates a community proposal: a title, description and one on-chain action.
 *
 * Validation runs through the shared `createProposalFormSchema` so the form
 * rejects the same payloads the API does, and the first issue per field is
 * rendered under that control.
 */
export function CreateProposalForm({ communityId, onCreated, onCancel }: CreateProposalFormProps) {
  const formId = useId();
  const titleId = `${formId}-title`;
  const descriptionId = `${formId}-description`;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProposalType>('general');
  const [actionType, setActionType] = useState<ProposalActionType>('transfer');
  const [params, setParams] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleActionChange = useCallback((value: string) => {
    setActionType(value as ProposalActionType);
    setParams({});
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFieldErrors({});
      setFormError('');

      const payload: CreateProposalPayload = {
        communityId,
        title: title.trim(),
        description: description.trim(),
        type,
        actions: [{ type: actionType, params }],
      };

      const result = createProposalFormSchema.safeParse(payload);
      if (!result.success) {
        const next: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = issue.path.join('.');
          if (key && !next[key]) next[key] = issue.message;
        }
        setFieldErrors(next);
        if (!next.title && !next.description && !next.type && !next.actions) {
          setFormError(result.error.issues[0]?.message ?? 'Check the form and try again.');
        }
        return;
      }

      setSubmitting(true);
      try {
        const response = await api.post('/api/v1/proposals', payload);
        onCreated?.(response);
        setTitle('');
        setDescription('');
        setParams({});
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : 'Failed to create the proposal. Try again.'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [actionType, communityId, description, onCreated, params, title, type]
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
        id={titleId}
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        required
        error={fieldErrors.title}
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
      {fieldErrors.description && (
        <p className={styles.hint} role="alert">
          {fieldErrors.description}
        </p>
      )}

      <Select
        label="Proposal type"
        options={PROPOSAL_TYPE_OPTIONS}
        value={type}
        onChange={(value) => setType(value as ProposalType)}
      />

      <Select
        label="Action"
        options={ACTION_TYPE_OPTIONS}
        value={actionType}
        onChange={handleActionChange}
      />

      {ACTION_PARAM_FIELDS[actionType].map((field) => (
        <Input
          key={field.key}
          id={`${formId}-${field.key}`}
          label={field.label}
          value={params[field.key] ?? ''}
          onChange={(event) =>
            setParams((current) => ({ ...current, [field.key]: event.target.value }))
          }
          placeholder={field.placeholder}
          required
        />
      ))}

      {fieldErrors.actions && (
        <p className={styles.hint} role="alert">
          {fieldErrors.actions}
        </p>
      )}

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
