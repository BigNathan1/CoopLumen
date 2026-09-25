'use client';

import { useEffect, useState } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { api, isApiError } from '@/lib/api';
import { setSchemaFieldErrors } from '@/lib/formErrors';
import {
  createCommunitySchema,
  parseWithFieldErrors,
  type CreateCommunityInput,
} from '@/lib/schemas';
import { Form, FormError, FormField, FormSubmit } from './ui/Form';
import { Button } from './ui/Button';
import styles from './CreateCommunityForm.module.css';

/** Values held by the controlled fields in the create form. */
export interface CreateCommunityFormValues {
  name: string;
  description: string;
  issuerPublicKey: string;
  assetCode: string;
  assetIssuer: string;
}

/** Short alias for consumers that use the component's value type directly. */
export type CreateCommunityValues = CreateCommunityFormValues;

export interface CreateCommunityFormProps {
  /**
   * Persists a validated community. When omitted, the form posts directly to
   * `POST /api/v1/communities`, which is useful for the standalone component
   * and keeps the form easy to exercise in isolation.
   */
  onSubmit?: (values: CreateCommunityInput) => unknown | Promise<unknown>;
  /** Called after the default API request or a custom submit handler succeeds. */
  onSuccess?: (community: unknown) => void;
  /** Alias for `onSuccess`, useful for page-level navigation handlers. */
  onCreated?: (community: unknown) => void;
  /** Initial values, including a wallet address pre-filled by the caller. */
  defaultValues?: Partial<CreateCommunityFormValues>;
  /** Connected wallet address to mirror into the issuer field. */
  walletAddress?: string | null;
  /** Explicit issuer address alias for callers that already have the value. */
  issuerPublicKey?: string | null;
  /** Called by the optional cancel button. */
  onCancel?: () => void;
  /** Label shown on the submit button. */
  submitLabel?: string;
  /** Additional class applied to the form. */
  className?: string;
}

const EMPTY_VALUES: CreateCommunityFormValues = {
  name: '',
  description: '',
  issuerPublicKey: '',
  assetCode: '',
  assetIssuer: '',
};

const CREATE_FORM_FIELDS: readonly (keyof CreateCommunityFormValues)[] = [
  'name',
  'description',
  'issuerPublicKey',
  'assetCode',
  'assetIssuer',
];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Create-community form with the same client-side rules as the backend.
 *
 * The form deliberately keeps Stellar keys as text fields: the shared schema
 * checks the public-key shape before a request is made, while the backend
 * remains authoritative for the StrKey checksum and authorization checks.
 */
export function CreateCommunityForm({
  onSubmit,
  onSuccess,
  onCreated,
  defaultValues,
  walletAddress,
  issuerPublicKey,
  onCancel,
  submitLabel = 'Create community',
  className,
}: CreateCommunityFormProps): React.JSX.Element {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasIssuerOverride = walletAddress !== undefined || issuerPublicKey !== undefined;
  const walletIssuer = hasIssuerOverride ? (walletAddress ?? issuerPublicKey ?? '') : undefined;
  const issuerLocked = Boolean(walletIssuer);
  const form = useForm<CreateCommunityFormValues>({
    defaultValues: {
      ...EMPTY_VALUES,
      ...defaultValues,
      ...(walletIssuer ? { issuerPublicKey: walletIssuer } : {}),
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (!hasIssuerOverride) return;
    form.setValue('issuerPublicKey', walletIssuer ?? '', {
      shouldDirty: true,
      shouldValidate: Boolean(walletIssuer),
    });
    form.clearErrors('issuerPublicKey');
  }, [form, hasIssuerOverride, walletIssuer]);

  const handleSubmit = async (values: CreateCommunityFormValues): Promise<void> => {
    setSuccessMessage(null);
    form.clearErrors();

    const parsed = parseWithFieldErrors(createCommunitySchema, values);
    if (!parsed.success) {
      const firstField = setSchemaFieldErrors(form.setError, parsed.errors, CREATE_FORM_FIELDS);
      if (firstField) form.setFocus(firstField as Path<CreateCommunityFormValues>);
      return;
    }

    if (walletAddress && parsed.data.issuerPublicKey !== walletAddress) {
      const firstField = setSchemaFieldErrors(
        form.setError,
        { issuerPublicKey: 'Issuer public key must match the connected wallet' },
        CREATE_FORM_FIELDS
      );
      if (firstField) form.setFocus(firstField as Path<CreateCommunityFormValues>);
      return;
    }

    const { description, ...valuesWithoutDescription } = parsed.data;
    const input = description
      ? { ...valuesWithoutDescription, description }
      : valuesWithoutDescription;

    try {
      const result = onSubmit
        ? await onSubmit(input)
        : await api.post<unknown>('/api/v1/communities', input);

      onSuccess?.(result);
      onCreated?.(result);
      setSuccessMessage('Community created successfully.');
    } catch (error) {
      if (isApiError(error) && error.details.length > 0) {
        const firstField = setSchemaFieldErrors(
          form.setError,
          Object.fromEntries(error.details.map(({ path, message }) => [path, message])),
          CREATE_FORM_FIELDS
        );
        if (firstField) form.setFocus(firstField as Path<CreateCommunityFormValues>);
        return;
      }
      throw new Error(errorMessage(error, 'Unable to create community. Please try again.'));
    }
  };

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <Form<CreateCommunityFormValues>
        form={form}
        onSubmit={handleSubmit}
        aria-label="Create community"
        className={styles.form}
      >
        <FormField<CreateCommunityFormValues>
          name="name"
          label="Community name"
          description="Choose a name between 2 and 64 characters."
          required
        >
          {(field) => (
            <input
              {...field}
              type="text"
              autoComplete="organization"
              maxLength={64}
              placeholder="e.g. EcoDAO Lagos"
            />
          )}
        </FormField>

        <FormField<CreateCommunityFormValues>
          name="description"
          label="Description"
          description="Tell members what this community is working toward (optional)."
        >
          {(field) => (
            <textarea
              {...field}
              rows={4}
              maxLength={500}
              placeholder="A short community description"
            />
          )}
        </FormField>

        <FormField<CreateCommunityFormValues>
          name="issuerPublicKey"
          label="Issuer public key"
          description="The 56-character Stellar account key (G…); the backend verifies its checksum."
          required
        >
          {(field) => (
            <input
              {...field}
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              readOnly={issuerLocked}
              aria-readonly={issuerLocked || undefined}
              placeholder="G…"
            />
          )}
        </FormField>

        <FormField<CreateCommunityFormValues>
          name="assetCode"
          label="Asset code"
          description="Use 1–12 letters or numbers."
          required
        >
          {(field) => (
            <input
              {...field}
              type="text"
              autoCapitalize="characters"
              autoCorrect="off"
              maxLength={12}
              placeholder="ECO"
            />
          )}
        </FormField>

        <FormField<CreateCommunityFormValues>
          name="assetIssuer"
          label="Asset issuer"
          description="The 56-character Stellar account key (G…); the backend verifies its checksum."
          required
        >
          {(field) => (
            <input
              {...field}
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="G…"
            />
          )}
        </FormField>

        {successMessage && (
          <p className={styles.success} role="status">
            {successMessage}
          </p>
        )}
        <FormError />
        <div className={styles.actions}>
          <FormSubmit pendingLabel="Creating…">{submitLabel}</FormSubmit>
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

export default CreateCommunityForm;
