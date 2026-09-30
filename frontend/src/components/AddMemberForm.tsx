'use client';

import { useState, type FormEvent } from 'react';
import { Select, type SelectOption } from './ui/Select';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { addMemberSchema, toFieldErrors, type MemberRole } from '@/lib/schemas';
import styles from './AddMemberForm.module.css';

/** Message shown when a submission is rejected without a usable one. */
const GENERIC_SUBMIT_ERROR = 'Could not add this member. Please try again.';

/**
 * The roles a community member can hold, in the order they are offered.
 *
 * Mirrors the backend enum. `member` is first because it is the right answer
 * for the large majority of invitations, and it is the value the API defaults
 * to, so leaving the dropdown alone is never wrong.
 */
export const MEMBER_ROLE_OPTIONS: SelectOption[] = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'observer', label: 'Observer' },
];

/** What an admin submits to invite someone into a community. */
export interface AddMemberValues {
  /** The invitee's Stellar account. */
  stellarAddress: string;
  /** The role to grant. Defaults to `member`. */
  role: MemberRole;
}

export interface AddMemberFormProps {
  /**
   * Called with the validated values. Rejecting surfaces the reason in an
   * alert and keeps the address, so a mistyped invite can be corrected rather
   * than retyped.
   */
  onSubmit: (values: AddMemberValues) => Promise<void> | void;
  /** Disables the controls while a submission is in flight. */
  isLoading?: boolean;
  /** Addresses already in the community, warned about as likely duplicates. */
  existingAddresses?: string[];
  className?: string;
}

/**
 * Form for adding a member to a community: a Stellar address and a role.
 *
 * The address is validated with the shared `stellarPublicKeySchema`, so the
 * shape rule the API enforces is the one the user is told about first; the
 * StrKey checksum is still the server's call, and its rejection comes back
 * through the submit alert.
 *
 * Accessibility notes:
 *
 * - `Input` and `Select` are the design-system primitives, so the label is
 *   associated with the control, the helper text and the error are announced
 *   as part of the field, and `aria-invalid` / `aria-required` are set without
 *   this component re-wiring them. The role dropdown keeps focus on its
 *   trigger and supports arrows, Home/End, Enter, Escape and typeahead;
 * - the role select starts on `member`, so the control is never in a
 *   "nothing chosen" state that the form would then have to complain about;
 * - it is a real `<form>` with a submit button, so `Enter` submits and tab
 *   order follows source order;
 * - the duplicate hint is polite (`role="status"`): it appears while the
 *   address is being typed, and must not interrupt;
 * - a failed submission renders an `Alert`, which carries `role="alert"`.
 *
 * @example
 * ```tsx
 * <AddMemberForm
 *   existingAddresses={members.map((m) => m.stellar_address)}
 *   onSubmit={(values) => addMember(communityId, values)}
 * />
 * ```
 */
export function AddMemberForm({
  onSubmit,
  isLoading = false,
  existingAddresses = [],
  className,
}: AddMemberFormProps) {
  const [stellarAddress, setStellarAddress] = useState('');
  const [role, setRole] = useState<string>('member');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addedAddress, setAddedAddress] = useState<string | null>(null);

  const trimmedAddress = stellarAddress.trim();
  const isDuplicate =
    existingAddresses.length > 0 && existingAddresses.some((entry) => entry === trimmedAddress);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setAddedAddress(null);

    const parsed = addMemberSchema.safeParse({
      stellarAddress: trimmedAddress,
      role: role || undefined,
    });

    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }

    setErrors({});

    try {
      await onSubmit({ ...parsed.data, role: parsed.data.role ?? 'member' });
      setStellarAddress('');
      setAddedAddress(trimmedAddress);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message ? error.message : GENERIC_SUBMIT_ERROR
      );
    }
  };

  return (
    <Card className={[styles.card, className].filter(Boolean).join(' ')}>
      <div className={styles.header}>
        <h2 className={styles.title}>Add a member</h2>
        <p className={styles.subtitle}>
          Give someone access to this community by adding their Stellar address.
        </p>
      </div>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      {addedAddress && (
        <Alert variant="success" title="Member added">
          {addedAddress} now belongs to this community.
        </Alert>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className={styles.form} noValidate>
        <Input
          label="Stellar address"
          required
          value={stellarAddress}
          onChange={(event) => setStellarAddress(event.target.value)}
          placeholder="G…"
          helperText="The member's public key, starting with G and 56 characters long."
          error={errors.stellarAddress}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={isLoading}
        />

        {isDuplicate && (
          <p className={styles.duplicate} role="status">
            This address is already a member. Submitting again will update their role.
          </p>
        )}

        <Select
          label="Role"
          options={MEMBER_ROLE_OPTIONS}
          value={role}
          onChange={setRole}
          helperText="Admins manage members and settings; treasurers move funds; observers can only read."
          error={errors.role}
          disabled={isLoading}
        />

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            loadingLabel="Adding member"
          >
            Add member
          </Button>
        </div>
      </form>
    </Card>
  );
}
