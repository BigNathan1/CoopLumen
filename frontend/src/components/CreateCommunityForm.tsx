'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCreateCommunity } from '@/hooks/useCreateCommunity';
import { Form, FormField, FormError } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import styles from './CreateCommunityForm.module.css';
import type { Community } from '@/hooks/useCommunities';

/** Stellar public key: G + 55 uppercase base32 characters. */
const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;
/** Asset code: 1–12 alphanumeric characters. */
const ASSET_CODE_RE = /^[A-Za-z0-9]{1,12}$/;

interface FormValues {
  name: string;
  description: string;
  issuerPublicKey: string;
  assetCode: string;
  assetIssuer: string;
}

/**
 * Client component that renders the create-community form.
 *
 * Separated from the page shell so tests can render it directly without
 * resolving Next.js route params.
 *
 * Accessibility:
 * - All fields are labelled with visible `<label>` elements associated via
 *   `htmlFor` / `id` (delegated to FormField).
 * - Required fields carry `aria-required` and a visible asterisk.
 * - Validation messages are announced via `role="alert"` (FormField).
 * - The form-level API error is an assertive live region (FormError).
 * - The submit button shows `aria-busy` and is disabled while in flight.
 * - On success the router navigates to the new community detail page so
 *   the next `<h1>` receives focus naturally.
 */
export function CreateCommunityForm() {
  const router = useRouter();
  const { createCommunity, submitting } = useCreateCommunity();

  const handleSubmit = useCallback(
    async (values: FormValues): Promise<void> => {
      const community: Community | null = await createCommunity({
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        issuerPublicKey: values.issuerPublicKey.trim(),
        assetCode: values.assetCode.trim(),
        assetIssuer: values.assetIssuer.trim(),
      });

      if (!community) {
        throw new Error('Failed to create community. Please try again.');
      }

      router.push(`/communities/${community.id}`);
    },
    [createCommunity, router]
  );

  return (
    <Form<FormValues>
      onSubmit={handleSubmit}
      mode="onTouched"
      className={styles.form}
      aria-label="Create community"
    >
      {/* ── Community identity ── */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Community identity</legend>

        <FormField<FormValues>
          name="name"
          label="Community name"
          required
          description="2–64 characters. This is the public display name."
          rules={{
            required: 'Name is required',
            minLength: { value: 2, message: 'Name must be at least 2 characters' },
            maxLength: { value: 64, message: 'Name must be 64 characters or fewer' },
          }}
        >
          {(field) => (
            <input
              {...field}
              type="text"
              className={styles.input}
              placeholder="e.g. EcoDAO Lagos"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </FormField>

        <FormField<FormValues>
          name="description"
          label="Description"
          description="Optional. Up to 500 characters."
          rules={{
            maxLength: { value: 500, message: 'Description must be 500 characters or fewer' },
          }}
        >
          {(field) => (
            <textarea
              {...field}
              className={[styles.input, styles.textarea].join(' ')}
              placeholder="What is this community about?"
              rows={3}
              maxLength={500}
            />
          )}
        </FormField>
      </fieldset>

      <hr className={styles.divider} aria-hidden="true" />

      {/* ── Stellar token ── */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Stellar token</legend>

        <FormField<FormValues>
          name="assetCode"
          label="Asset code"
          required
          description="1–12 letters and digits (e.g. ECOLGS). This becomes the community token ticker."
          rules={{
            required: 'Asset code is required',
            validate: (v: string) =>
              ASSET_CODE_RE.test(v.trim()) || 'Asset code must be 1–12 letters and numbers only',
          }}
        >
          {(field) => (
            <input
              {...field}
              type="text"
              className={[styles.input, styles.mono].join(' ')}
              placeholder="ECOLGS"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
            />
          )}
        </FormField>

        <FormField<FormValues>
          name="assetIssuer"
          label="Asset issuer address"
          required
          description="Stellar public key (starts with G) of the account that issued the token."
          rules={{
            required: 'Asset issuer address is required',
            validate: (v: string) =>
              STELLAR_KEY_RE.test(v.trim()) ||
              'Enter a valid Stellar public key (starts with G, 56 characters)',
          }}
        >
          {(field) => (
            <input
              {...field}
              type="text"
              className={[styles.input, styles.mono].join(' ')}
              placeholder="G…"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </FormField>

        <FormField<FormValues>
          name="issuerPublicKey"
          label="Governance issuer key"
          required
          description="Stellar public key authorised to sign governance transactions for this community."
          rules={{
            required: 'Governance issuer key is required',
            validate: (v: string) =>
              STELLAR_KEY_RE.test(v.trim()) ||
              'Enter a valid Stellar public key (starts with G, 56 characters)',
          }}
        >
          {(field) => (
            <input
              {...field}
              type="text"
              className={[styles.input, styles.mono].join(' ')}
              placeholder="G…"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </FormField>
      </fieldset>

      {/* ── Form-level API error ── */}
      <FormError className={styles.formError} />

      {/* ── Submit ── */}
      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          isLoading={submitting}
          loadingLabel="Creating community…"
          className={styles.submitBtn}
        >
          Create community
        </Button>

        <Link href="/communities" className={styles.backLink}>
          Cancel
        </Link>
      </div>
    </Form>
  );
}
