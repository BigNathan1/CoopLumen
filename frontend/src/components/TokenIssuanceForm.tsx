'use client';

import { useId, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Alert } from './ui/Alert';
import { AmountInput } from './ui/AmountInput';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { amountSchema, assetCodeSchema, toFieldErrors } from '@/lib/schemas';
import styles from './TokenIssuanceForm.module.css';

/** Longest description the `tokens.description` column accepts. */
const DESCRIPTION_MAX_LENGTH = 500;

/** Message shown when a submission is rejected without a usable one. */
const GENERIC_SUBMIT_ERROR = 'Could not issue this token. Please try again.';

/** An asset code the ledger would accept, used to gate the amount suffix. */
const ASSET_CODE_SHAPE = /^[A-Za-z0-9]{1,12}$/;

/**
 * What a community admin enters to mint its token.
 *
 * The issuer and distributor are deliberately not part of this: issuance is a
 * pair of on-chain operations signed by the admin's own wallet, so the
 * connected account is both. Only the details of the asset are collected here.
 */
export interface TokenIssuanceValues {
  /** 1-12 alphanumeric characters: the code the asset is held under. */
  assetCode: string;
  /** Positive fixed-point amount, at most 7 decimal places. */
  amount: string;
  /** Optional human-readable summary shown wherever the token is listed. */
  description?: string;
}

export interface TokenIssuanceFormProps {
  /**
   * Called with the validated values. Rejecting surfaces the reason in an
   * alert rather than clearing the form, so an admin does not lose what they
   * typed when a submission fails.
   */
  onSubmit: (values: TokenIssuanceValues) => Promise<void> | void;
  /**
   * The connected account that will sign the issuance. Shown for confirmation
   * only; it is never submitted from here.
   */
  issuerPublicKey?: string;
  /** Disables the controls while a submission is in flight. */
  isLoading?: boolean;
  className?: string;
}

/**
 * Built from the shared primitives so the form enforces exactly the rules the
 * API does and words them the same way. The description is optional, so an
 * empty one is dropped rather than submitted as a blank string.
 */
const tokenIssuanceSchema = z.object({
  assetCode: assetCodeSchema,
  amount: amountSchema,
  description: z
    .string()
    .trim()
    .max(
      DESCRIPTION_MAX_LENGTH,
      `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`
    )
    .optional(),
});

/**
 * Form for issuing a community token: asset code, amount and description.
 *
 * Validation runs on submit rather than on every keystroke, so a half-typed
 * asset code is never shouted at, and each message lands on the field it
 * belongs to rather than in a single banner.
 *
 * Accessibility notes:
 *
 * - the fields are design-system primitives, which own the label association,
 *   the `aria-describedby` wiring and `aria-invalid` / `aria-required`, so
 *   this component does not re-implement any of it;
 * - the amount field is a bare `AmountInput`, so its label is rendered here as
 *   a real `<label htmlFor>` - a click on the text still focuses the input;
 * - it is a real `<form>` with a submit button, so `Enter` in any field
 *   submits it and tab order follows source order;
 * - the submit button stays enabled while the form is incomplete, because a
 *   disabled button tells a keyboard user nothing about what is missing -
 *   pressing it instead reports the reason under the offending field;
 * - a failed submission renders an `Alert`, which carries `role="alert"` and
 *   is announced as soon as it appears.
 *
 * @example
 * ```tsx
 * <TokenIssuanceForm
 *   issuerPublicKey={publicKey}
 *   onSubmit={(values) => issueToken(values)}
 * />
 * ```
 */
export function TokenIssuanceForm({
  onSubmit,
  issuerPublicKey,
  isLoading = false,
  className,
}: TokenIssuanceFormProps) {
  const amountId = useId();
  const amountHintId = `${amountId}-hint`;

  const [assetCode, setAssetCode] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmedAssetCode = assetCode.trim();
  // Only decorate the amount field once the code is one the ledger accepts.
  const amountSuffix = ASSET_CODE_SHAPE.test(trimmedAssetCode) ? trimmedAssetCode : undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const parsed = tokenIssuanceSchema.safeParse({
      assetCode,
      amount,
      description: description.trim() || undefined,
    });

    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }

    setErrors({});

    try {
      await onSubmit(parsed.data);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message ? error.message : GENERIC_SUBMIT_ERROR
      );
    }
  };

  return (
    <Card className={[styles.card, className].filter(Boolean).join(' ')}>
      <div className={styles.header}>
        <h2 className={styles.title}>Issue a community token</h2>
        <p className={styles.subtitle}>
          Mint a new asset for your community. The issuance transaction is signed by your own
          wallet.
        </p>
      </div>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      <form onSubmit={(event) => void handleSubmit(event)} className={styles.form} noValidate>
        <Input
          label="Asset code"
          required
          value={assetCode}
          onChange={(event) => setAssetCode(event.target.value)}
          placeholder="e.g. ECO"
          helperText="1-12 letters and numbers. The ticker members will see."
          error={errors.assetCode}
          maxLength={12}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={isLoading}
        />

        <div className={styles.field}>
          <label htmlFor={amountId} className={styles.label}>
            Amount
            <span aria-hidden="true" className={styles.requiredMark}>
              *
            </span>
          </label>
          <AmountInput
            id={amountId}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            asset={amountSuffix}
            aria-describedby={amountHintId}
            aria-required="true"
            aria-invalid={errors.amount ? true : undefined}
            placeholder="0.00"
            disabled={isLoading}
          />
          <span
            id={amountHintId}
            role={errors.amount ? 'alert' : undefined}
            className={errors.amount ? styles.error : styles.helper}
          >
            {errors.amount ?? 'How much to mint, with up to 7 decimal places.'}
          </span>
        </div>

        <Textarea
          label="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this token represents in your community."
          helperText="Shown wherever the token is listed."
          error={errors.description}
          maxLength={DESCRIPTION_MAX_LENGTH}
          showCount
          rows={3}
          disabled={isLoading}
        />

        {issuerPublicKey && (
          <p className={styles.issuer}>
            Issuing from <span className={styles.mono}>{issuerPublicKey}</span>
          </p>
        )}

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            loadingLabel="Issuing token"
          >
            Issue token
          </Button>
        </div>
      </form>
    </Card>
  );
}
