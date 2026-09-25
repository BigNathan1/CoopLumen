'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { api, isApiError } from '@/lib/api';
import { setSchemaFieldErrors } from '@/lib/formErrors';
import {
  updateCommunitySchema,
  parseWithFieldErrors,
  type UpdateCommunityInput,
} from '@/lib/schemas';
import { Form, FormError, FormField, FormSubmit } from './ui/Form';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';
import styles from './EditCommunityForm.module.css';

/** The community fields needed to render the edit form. */
export interface EditableCommunity {
  id?: string;
  name: string;
  description?: string | null;
  asset_code?: string;
  asset_issuer?: string;
  issuer_public_key?: string;
  [key: string]: unknown;
}

export interface EditCommunityFormValues {
  name: string;
  description: string;
}

/** Short alias for consumers that use the component's value type directly. */
export type EditCommunityValues = EditCommunityFormValues;

export interface EditCommunityFormProps {
  /** Existing community used to pre-populate the form. */
  community?: EditableCommunity;
  /** Alias for `community`, useful when data comes from a route loader. */
  initialCommunity?: EditableCommunity;
  /** Explicit route id used by the default PUT callback. */
  communityId?: string;
  /** Overrides individual initial values (primarily for controlled test/story use). */
  defaultValues?: Partial<EditCommunityFormValues>;
  /** Persists a validated update. Defaults to the community PUT endpoint. */
  onSubmit?: (values: UpdateCommunityInput) => unknown | Promise<unknown>;
  /** Alias for `onSubmit`. */
  onSave?: (values: UpdateCommunityInput) => unknown | Promise<unknown>;
  /** Called after the update succeeds. */
  onSuccess?: (community: unknown) => void;
  /** Alias for `onSuccess`. */
  onUpdated?: (community: unknown) => void;
  /** Invoked by the optional cancel button. */
  onCancel?: () => void;
  submitLabel?: string;
  className?: string;
}

function valuesFromCommunity(community?: EditableCommunity): EditCommunityFormValues {
  return {
    name: community?.name ?? '',
    description: community?.description ?? '',
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Edit form for the mutable community profile.
 *
 * Asset identity is intentionally read-only: the backend's update contract
 * permits name, description, and settings changes, while changing an issuer or
 * asset code would invalidate the community's on-chain identity.
 */
export function EditCommunityForm({
  community,
  initialCommunity,
  communityId,
  defaultValues,
  onSubmit,
  onSave,
  onSuccess,
  onUpdated,
  onCancel,
  submitLabel = 'Save changes',
  className,
}: EditCommunityFormProps): React.JSX.Element {
  const record = community ?? initialCommunity;
  const defaultName = defaultValues?.name;
  const defaultDescription = defaultValues?.description;
  const initialValues = useMemo(() => {
    const communityValues = valuesFromCommunity(record);
    return {
      name: defaultName ?? communityValues.name,
      description: defaultDescription ?? communityValues.description,
    };
  }, [defaultDescription, defaultName, record]);
  const form = useForm<EditCommunityFormValues>({
    defaultValues: initialValues,
    mode: 'onTouched',
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // SWR-style route data can arrive after the first render. Resetting the form
  // here makes the component useful both as a route form and as a direct form.
  useEffect(() => {
    if (record) {
      form.reset(initialValues);
      setSuccessMessage(null);
    }
  }, [form, initialValues, record]);

  const handleSubmit = async (values: EditCommunityFormValues): Promise<void> => {
    setSuccessMessage(null);
    form.clearErrors();

    const parsed = parseWithFieldErrors(updateCommunitySchema, {
      name: values.name,
      // An empty value is an intentional clear. The backend represents a
      // missing description as null rather than an empty string.
      description: values.description.trim() || null,
    });
    if (!parsed.success) {
      const firstField = setSchemaFieldErrors(form.setError, parsed.errors);
      if (firstField) form.setFocus(firstField as Path<EditCommunityFormValues>);
      return;
    }

    try {
      const submit = onSubmit ?? onSave;
      const result = submit
        ? await submit(parsed.data)
        : await api.put<unknown>(
            `/api/v1/communities/${encodeURIComponent(record?.id ?? communityId ?? '')}`,
            parsed.data
          );

      onSuccess?.(result);
      onUpdated?.(result);
      setSuccessMessage('Community changes saved.');
    } catch (error) {
      if (isApiError(error) && error.details.length > 0) {
        const firstField = setSchemaFieldErrors(
          form.setError,
          Object.fromEntries(error.details.map(({ path, message }) => [path, message]))
        );
        if (firstField) form.setFocus(firstField as Path<EditCommunityFormValues>);
      }
      throw new Error(errorMessage(error, 'Unable to save community changes. Please try again.'));
    }
  };

  if (!record) {
    return (
      <Alert variant="error" title="Community unavailable">
        We could not load the community details. Refresh the page and try again.
      </Alert>
    );
  }

  const assetCode =
    record.asset_code ?? (typeof record.assetCode === 'string' ? record.assetCode : undefined);
  const assetIssuer =
    record.asset_issuer ??
    (typeof record.assetIssuer === 'string' ? record.assetIssuer : undefined) ??
    record.issuer_public_key ??
    (typeof record.issuerPublicKey === 'string' ? record.issuerPublicKey : undefined);

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <Form<EditCommunityFormValues>
        form={form}
        onSubmit={handleSubmit}
        aria-label="Edit community"
        className={styles.form}
      >
        <FormField<EditCommunityFormValues>
          name="name"
          label="Community name"
          description="Choose a name between 2 and 64 characters."
          required
        >
          {(field) => <input {...field} type="text" autoComplete="organization" maxLength={64} />}
        </FormField>

        <FormField<EditCommunityFormValues>
          name="description"
          label="Description"
          description="Update the description shown to community members."
        >
          {(field) => <textarea {...field} rows={5} maxLength={500} />}
        </FormField>

        <dl className={styles.identity} aria-label="Community asset identity">
          <div>
            <dt>Asset code</dt>
            <dd>{assetCode ?? '—'}</dd>
          </div>
          <div>
            <dt>Asset issuer</dt>
            <dd className={styles.address}>{assetIssuer ?? '—'}</dd>
          </div>
        </dl>

        {successMessage && (
          <p className={styles.success} role="status">
            {successMessage}
          </p>
        )}
        <FormError />
        <div className={styles.actions}>
          <FormSubmit pendingLabel="Saving…">{submitLabel}</FormSubmit>
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </Form>
    </div>
  );
}

export default EditCommunityForm;
