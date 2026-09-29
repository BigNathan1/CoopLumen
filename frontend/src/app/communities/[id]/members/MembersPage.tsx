'use client';

import Link from 'next/link';
import {
  useCommunity,
  useCommunityMembers,
  useAddMember,
  useRemoveMember,
  type CommunityMember,
} from '@/hooks/useCommunities';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useState, useId } from 'react';
import type { MemberRole } from '@/lib/schemas';
import styles from './MembersPage.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;

const ROLE_VARIANT: Record<MemberRole, BadgeVariant> = {
  admin: 'error',
  treasurer: 'warning',
  member: 'success',
  observer: 'neutral',
};

const ROLE_LABEL: Record<MemberRole, string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  member: 'Member',
  observer: 'Observer',
};

const ROLES: MemberRole[] = ['admin', 'treasurer', 'member', 'observer'];

function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  communityId: string;
}

/**
 * Client component that fetches and renders the member-management view.
 *
 * Separated from the page shell so unit tests can render it directly without
 * mocking Next.js `params` resolution.
 *
 * Accessibility:
 * - Single `<h1>` from the page shell; members section carries `<h2>`.
 * - `<main>` landmark with an accessible name (delegated to page shell).
 * - Add-member form fields are labelled with visible `<label>` elements.
 * - Validation messages use `role="alert"`.
 * - Loading states use `role="status"` (Spinner / LoadingSkeleton).
 * - Remove buttons carry an `aria-label` naming the specific member.
 * - Confirm dialog is modal and focus-trapped (ConfirmDialog).
 */
export function MembersPage({ communityId }: Props) {
  // ── Data ────────────────────────────────────────────────────────────────────
  const {
    data: community,
    error: communityError,
    isLoading: communityLoading,
  } = useCommunity(communityId);
  const {
    data: members,
    error: membersError,
    isLoading: membersLoading,
  } = useCommunityMembers(communityId);
  const { addMember, submitting: adding, error: addError } = useAddMember(communityId);
  const { removeMember, submitting: removing, error: removeError } = useRemoveMember(communityId);

  // ── Add-member form state ────────────────────────────────────────────────────
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<MemberRole>('member');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  // ── Remove confirm state ─────────────────────────────────────────────────────
  const [pendingRemove, setPendingRemove] = useState<CommunityMember | null>(null);

  const formId = useId();
  const addressId = `${formId}-address`;
  const roleId = `${formId}-role`;
  const addressErrorId = `${formId}-address-error`;

  // ── Full-page community loading ──────────────────────────────────────────────
  if (communityLoading) {
    return (
      <div className={styles.centred}>
        <Spinner size="lg" label="Loading community…" />
      </div>
    );
  }

  if (communityError || !community) {
    return (
      <div className={styles.errorWrap}>
        <Link href="/communities" className={styles.backLink}>
          <span className={styles.backArrow} aria-hidden="true" />
          Back to communities
        </Link>
        <Alert variant="error" title="Community not found">
          {communityError
            ? communityError.message
            : 'This community does not exist or could not be loaded.'}
        </Alert>
      </div>
    );
  }

  // ── Add member handler ───────────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setAddSuccess(false);

    const trimmed = address.trim();
    if (!STELLAR_KEY_RE.test(trimmed)) {
      setFieldError('Enter a valid Stellar public key (starts with G, 56 characters)');
      return;
    }

    const member = await addMember({ stellarAddress: trimmed, role });
    if (member) {
      setAddress('');
      setRole('member');
      setAddSuccess(true);
    }
  };

  // ── Remove confirm handler ───────────────────────────────────────────────────
  const handleRemoveConfirm = async () => {
    if (!pendingRemove) return;
    await removeMember(pendingRemove.id);
    setPendingRemove(null);
  };

  return (
    <div className={styles.content}>
      {/* ── Back link ── */}
      <Link href={`/communities/${communityId}`} className={styles.backLink}>
        <span className={styles.backArrow} aria-hidden="true" />
        Back to {community.name}
      </Link>

      <div className={styles.grid}>
        {/* ── Left: member roster ── */}
        <section aria-labelledby="members-heading" className={styles.section}>
          <h2 id="members-heading" className={styles.sectionHeading}>
            Members
            {members && (
              <span className={styles.count} aria-label={`${members.length} members`}>
                {members.length}
              </span>
            )}
          </h2>

          {/* Remove error */}
          {removeError && (
            <Alert variant="error" title="Could not remove member">
              {removeError}
            </Alert>
          )}

          {membersLoading && (
            <ul className={styles.list} aria-label="Members loading">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className={styles.skeletonRow}>
                  <LoadingSkeleton
                    variant="circle"
                    size={40}
                    decorative={i !== 0}
                    label={i === 0 ? 'Loading members' : undefined}
                  />
                  <div className={styles.skeletonText}>
                    <LoadingSkeleton variant="text" width="60%" decorative />
                    <LoadingSkeleton variant="text" width="30%" decorative />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {membersError && (
            <Alert variant="error" title="Could not load members">
              {membersError.message}
            </Alert>
          )}

          {!membersLoading && !membersError && members && members.length === 0 && (
            <EmptyState title="No members yet" message="Add the first member using the form." />
          )}

          {!membersLoading && !membersError && members && members.length > 0 && (
            <ul className={styles.list} aria-label="Community members">
              {members.map((member) => (
                <li key={member.id} className={styles.row}>
                  <Avatar address={member.stellar_address} size={40} />
                  <div className={styles.info}>
                    <span className={styles.address} title={member.stellar_address}>
                      <code>{truncateAddress(member.stellar_address)}</code>
                    </span>
                    <time className={styles.joinedAt} dateTime={member.joined_at}>
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </time>
                  </div>
                  <Badge
                    variant={ROLE_VARIANT[member.role]}
                    size="sm"
                    srLabel="Role: "
                    className={styles.roleBadge}
                  >
                    {ROLE_LABEL[member.role]}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${truncateAddress(member.stellar_address)}`}
                    onClick={() => setPendingRemove(member)}
                    disabled={removing}
                    className={styles.removeBtn}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Right: add member form ── */}
        <section aria-labelledby="add-member-heading" className={styles.section}>
          <h2 id="add-member-heading" className={styles.sectionHeading}>
            Add a member
          </h2>

          <form
            onSubmit={(e) => void handleAdd(e)}
            noValidate
            aria-label="Add member"
            className={styles.form}
          >
            <div className={styles.field}>
              <label htmlFor={addressId} className={styles.label}>
                Stellar address
                <span aria-hidden="true" className={styles.requiredMark}>
                  *
                </span>
              </label>
              <input
                id={addressId}
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setFieldError(null);
                  setAddSuccess(false);
                }}
                placeholder="G…"
                autoComplete="off"
                spellCheck={false}
                aria-required
                aria-invalid={Boolean(fieldError) || undefined}
                aria-describedby={fieldError ? addressErrorId : undefined}
                className={[styles.input, styles.mono, fieldError ? styles.inputError : '']
                  .filter(Boolean)
                  .join(' ')}
              />
              {fieldError && (
                <span id={addressErrorId} role="alert" className={styles.fieldError}>
                  {fieldError}
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor={roleId} className={styles.label}>
                Role
              </label>
              <select
                id={roleId}
                value={role}
                onChange={(e) => setRole(e.target.value as MemberRole)}
                className={styles.select}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>

            {addError && (
              <Alert variant="error" title="Could not add member">
                {addError}
              </Alert>
            )}

            {addSuccess && <Alert variant="success">Member added successfully.</Alert>}

            <Button
              type="submit"
              variant="primary"
              isLoading={adding}
              loadingLabel="Adding member…"
              fullWidth
            >
              Add member
            </Button>
          </form>
        </section>
      </div>

      {/* ── Remove confirm dialog ── */}
      <ConfirmDialog
        isOpen={Boolean(pendingRemove)}
        title="Remove member?"
        description={
          pendingRemove
            ? `Remove ${truncateAddress(pendingRemove.stellar_address)} from ${community.name}? This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        loading={removing}
        onConfirm={() => void handleRemoveConfirm()}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
