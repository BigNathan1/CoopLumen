'use client';

import type { CommunityMember } from '@/hooks/useCommunities';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import styles from './MemberList.module.css';

const ROLE_VARIANT: Record<CommunityMember['role'], BadgeVariant> = {
  admin: 'error',
  treasurer: 'warning',
  member: 'success',
  observer: 'neutral',
};

const ROLE_LABEL: Record<CommunityMember['role'], string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  member: 'Member',
  observer: 'Observer',
};

function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface MemberListProps {
  members: CommunityMember[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
}

/**
 * Renders the member roster for a community detail page.
 *
 * Accessibility:
 * - The list is wrapped in a `<section>` with an accessible heading so it is
 *   discoverable via landmark navigation.
 * - Each row uses `<li>` inside `<ul>` so screen readers announce the item
 *   count and position.
 * - The role badge carries an `srLabel` so "Admin" reads as "Role: Admin".
 * - The avatar's `alt` text names the truncated Stellar address.
 */
export function MemberList({ members, isLoading, error }: MemberListProps) {
  if (isLoading) {
    return (
      <section className={styles.section} aria-label="Community members">
        <h2 className={styles.heading}>Members</h2>
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
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.section} aria-label="Community members">
        <h2 className={styles.heading}>Members</h2>
        <Alert variant="error" title="Could not load members">
          {error.message}
        </Alert>
      </section>
    );
  }

  if (!members || members.length === 0) {
    return (
      <section className={styles.section} aria-label="Community members">
        <h2 className={styles.heading}>Members</h2>
        <EmptyState title="No members yet" message="This community has no members to display." />
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="Community members">
      <h2 className={styles.heading}>
        Members{' '}
        <span className={styles.count} aria-label={`${members.length} members`}>
          {members.length}
        </span>
      </h2>
      <ul className={styles.list}>
        {members.map((member) => (
          <li key={member.id} className={styles.row}>
            <Avatar address={member.stellar_address} size={40} />
            <div className={styles.info}>
              <span className={styles.address} title={member.stellar_address}>
                <code>{truncateAddress(member.stellar_address)}</code>
              </span>
              <time
                className={styles.joinedAt}
                dateTime={member.joined_at}
                aria-label={`Joined ${new Date(member.joined_at).toLocaleDateString()}`}
              >
                Joined {new Date(member.joined_at).toLocaleDateString()}
              </time>
            </div>
            <Badge
              variant={ROLE_VARIANT[member.role]}
              size="sm"
              srLabel="Role: "
              className={styles.role}
            >
              {ROLE_LABEL[member.role]}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
