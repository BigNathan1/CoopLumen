import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { createProposalFormSchema } from '../../lib/schemas';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

export type ProposalType = 'treasury' | 'parameter' | 'membership' | 'general';

export type ProposalActionType =
  | 'transfer'
  | 'mint'
  | 'burn'
  | 'set_parameter'
  | 'add_member'
  | 'remove_member';

export interface ProposalAction {
  id: string;
  type: ProposalActionType;
  params: Record<string, string>;
}

export interface CreateProposalPayload {
  communityId: string;
  title: string;
  description: string;
  type: ProposalType;
  actions: Array<{ type: ProposalActionType; params: Record<string, string> }>;
}

export interface CreateProposalFormProps {
  communityId?: string;
  onCreated?: (proposal: unknown) => void;
  onCancel?: () => void;
}

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}

function FormField({ label, htmlFor, error, errorId, children }: FormFieldProps) {
  return (
    <div className="form-field">
      <label htmlFor={htmlFor} className="form-field__label">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className="form-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const PROPOSAL_TYPE_OPTIONS: Array<{ value: ProposalType; label: string }> = [
  { value: 'treasury', label: 'Treasury' },
  { value: 'parameter', label: 'Parameter change' },
  { value: 'membership', label: 'Membership' },
  { value: 'general', label: 'General' },
];

const ACTION_TYPE_OPTIONS: Array<{ value: ProposalActionType; label: string }> = [
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
    { key: 'recipient', label: 'Recipient address', placeholder: 'G...' },
    { key: 'amount', label: 'Amount', placeholder: '0' },
  ],
  mint: [
    { key: 'recipient', label: 'Recipient address', placeholder: 'G...' },
    { key: 'amount', label: 'Amount', placeholder: '0' },
  ],
  burn: [
    { key: 'holder', label: 'Holder address', placeholder: 'G...' },
    { key: 'amount', label: 'Amount', placeholder: '0' },
  ],
  set_parameter: [
    { key: 'name', label: 'Parameter name', placeholder: 'quorum' },
    { key: 'value', label: 'Parameter value', placeholder: '0' },
  ],
  add_member: [{ key: 'member', label: 'Member address', placeholder: 'G...' }],
  remove_member: [{ key: 'member', label: 'Member address', placeholder: 'G...' }],
};

let actionIdCounter = 0;
function nextActionId(): string {
  actionIdCounter += 1;
  return `action-${Date.now()}-${actionIdCounter}`;
}

function createEmptyAction(): ProposalAction {
  return { id: nextActionId(), type: 'transfer', params: {} };
}

interface SchemaIssue {
  path: Array<string | number>;
  message: string;
}

interface SchemaResult {
  success: boolean;
  data?: unknown;
  issues?: SchemaIssue[];
}

function runSchema(
  schema: { safeParse: (value: unknown) => SchemaResult },
  value: unknown
): SchemaResult {
  return schema.safeParse(value);
}

function setSchemaFieldErrors(
  issues: SchemaIssue[],
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
): void {
  const next: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    if (path && !next[path]) {
      next[path] = issue.message;
    }
  }
  setFieldErrors(next);
}

function formErrors(issues: SchemaIssue[]): string[] {
  return issues.filter((issue) => issue.path.length === 0).map((issue) => issue.message);
}

export function CreateProposalForm({
  communityId = '',
  onCreated,
  onCancel,
}: CreateProposalFormProps): ReactNode {
  const formId = useId();
  const titleId = `${formId}-title`;
  const descriptionId = `${formId}-description`;
  const typeId = `${formId}-type`;
  const actionsGroupId = `${formId}-actions`;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProposalType>('general');
  const [actions, setActions] = useState<ProposalAction[]>([createEmptyAction()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const actionRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  const focusFirstError = useCallback(
    (issues: SchemaIssue[]) => {
      const first = issues[0];
      if (!first) return;
      const [head, index] = first.path;
      if (head === 'title') {
        titleRef.current?.focus();
      } else if (head === 'description') {
        descriptionRef.current?.focus();
      } else if (head === 'type') {
        typeRef.current?.focus();
      } else if (head === 'actions') {
        if (typeof index === 'number') {
          const action = actions[index];
          if (action) {
            actionRefs.current[action.id]?.focus();
            return;
          }
        }
        const firstAction = actions[0];
        if (firstAction) {
          actionRefs.current[firstAction.id]?.focus();
        }
      }
    },
    [actions]
  );

  const addAction = useCallback(() => {
    setActions((prev) => [...prev, createEmptyAction()]);
  }, []);

  const removeAction = useCallback((id: string) => {
    setActions((prev) => (prev.length <= 1 ? prev : prev.filter((a) => a.id !== id)));
  }, []);

  const updateActionType = useCallback((id: string, nextType: ProposalActionType) => {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, type: nextType, params: {} } : a)));
  }, []);

  const updateActionParam = useCallback((id: string, key: string, value: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, params: { ...a.params, [key]: value } } : a))
    );
  }, []);

  const payload = useMemo<CreateProposalPayload>(
    () => ({
      communityId,
      title: title.trim(),
      description: description.trim(),
      type,
      actions: actions.map((a) => ({ type: a.type, params: a.params })),
    }),
    [communityId, title, description, type, actions]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrors([]);
      setFieldErrors({});

      const result = runSchema(createProposalFormSchema, payload);
      if (!result.success) {
        const issues = result.issues ?? [];
        setSchemaFieldErrors(issues, setFieldErrors);
        const topLevel = formErrors(issues);
        if (topLevel.length > 0) {
          setErrors(topLevel);
        }
        focusFirstError(issues);
        return;
      }

      setSubmitting(true);
      try {
        const response = await api.post('/api/v1/proposals', payload);
        onCreated?.(response);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create proposal. Please try again.';
        setErrors([message]);
      } finally {
        setSubmitting(false);
      }
    },
    [payload, focusFirstError, onCreated]
  );

  const titleError = fieldErrors['title'];
  const descriptionError = fieldErrors['description'];
  const typeError = fieldErrors['type'];
  const actionsError = fieldErrors['actions'];

  return (
    <form
      className="create-proposal-form"
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${formId}-heading`}
    >
      <h2 id={`${formId}-heading`} className="create-proposal-form__heading">
        Create proposal
      </h2>

      {errors.length > 0 && (
        <Alert variant="error" role="alert" className="create-proposal-form__alert">
          <ul className="create-proposal-form__alert-list">
            {errors.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <FormField label="Title" htmlFor={titleId} error={titleError} errorId={`${titleId}-error`}>
        <input
          id={titleId}
          ref={titleRef}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${titleId}-error` : undefined}
          placeholder="Short summary of the proposal"
        />
      </FormField>

      <FormField
        label="Description"
        htmlFor={descriptionId}
        error={descriptionError}
        errorId={`${descriptionId}-error`}
      >
        <textarea
          id={descriptionId}
          ref={descriptionRef}
          className="input create-proposal-form__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={10000}
          rows={6}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? `${descriptionId}-error` : undefined}
          placeholder="Explain the motivation, details, and expected outcome"
        />
      </FormField>

      <FormField
        label="Proposal type"
        htmlFor={typeId}
        error={typeError}
        errorId={`${typeId}-error`}
      >
        <select
          id={typeId}
          ref={typeRef}
          className="select"
          value={type}
          onChange={(e) => setType(e.target.value as ProposalType)}
          aria-invalid={typeError ? true : undefined}
          aria-describedby={typeError ? `${typeId}-error` : undefined}
        >
          {PROPOSAL_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>

      <fieldset
        className="create-proposal-form__actions"
        aria-describedby={actionsError ? `${actionsGroupId}-error` : undefined}
      >
        <legend className="create-proposal-form__legend">Actions</legend>

        {actionsError && (
          <p id={`${actionsGroupId}-error`} className="form-field__error" role="alert">
            {actionsError}
          </p>
        )}

        <ul className="create-proposal-form__action-list">
          {actions.map((action, index) => {
            const actionTypeId = `${formId}-action-${action.id}-type`;
            const paramFields = ACTION_PARAM_FIELDS[action.type] ?? [];
            return (
              <li key={action.id} className="create-proposal-form__action">
                <div className="create-proposal-form__action-header">
                  <span className="create-proposal-form__action-index">Action {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeAction(action.id)}
                    disabled={actions.length <= 1}
                    aria-label={`Remove action ${index + 1}`}
                  >
                    Remove
                  </Button>
                </div>

                <FormField label="Action type" htmlFor={actionTypeId}>
                  <select
                    id={actionTypeId}
                    ref={(el: HTMLSelectElement | null) => {
                      actionRefs.current[action.id] = el;
                    }}
                    className="select"
                    value={action.type}
                    onChange={(e) =>
                      updateActionType(action.id, e.target.value as ProposalActionType)
                    }
                  >
                    {ACTION_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                {paramFields.map((field) => {
                  const paramId = `${formId}-action-${action.id}-${field.key}`;
                  return (
                    <FormField key={field.key} label={field.label} htmlFor={paramId}>
                      <input
                        id={paramId}
                        className="input"
                        value={action.params[field.key] ?? ''}
                        onChange={(e) => updateActionParam(action.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    </FormField>
                  );
                })}
              </li>
            );
          })}
        </ul>

        <Button type="button" variant="secondary" onClick={addAction}>
          Add action
        </Button>
      </fieldset>

      <div className="create-proposal-form__footer">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create proposal'}
        </Button>
      </div>
    </form>
  );
}

export default CreateProposalForm;
