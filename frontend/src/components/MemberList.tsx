'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommunityMember } from '@/hooks/useCommunities';
import { api, type ApiEnvelope } from '@/lib/api';
import type { UsePaginationReturn } from '@/hooks/usePagination';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { PaginationInner } from '@/components/ui/Pagination';
import styles from './MemberList.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

// Re-export CommunityMember so the paginated tests that import it from here
// continue to work, even though the canonical definition lives in useCommunities.
export type { CommunityMember };

/** Short alias for consumers that refer to a row simply as a member. */
export type Member = CommunityMember;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const ROLE_VARIANT: Record<string, BadgeVariant> = {
  admin: 'error',
  treasurer: 'warning',
  member: 'success',
  observer: 'neutral',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  member: 'Member',
  observer: 'Observer',
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MemberListProps {
  /**
   * Pre-fetched members to display.
   *
   * When provided the component renders the list directly (with optional
   * client-side pagination).  When omitted alongside a `communityId`, the
   * component fetches from the API itself.
   */
  members?: CommunityMember[] | readonly CommunityMember[];

  /**
   * Pass `isLoading` to show the loading skeleton while the parent hook is
   * still fetching members.
   */
  isLoading?: boolean;

  /**
   * Pass `error` to show an error alert when the parent hook has failed.
   */
  error?: Error | undefined;

  // ── Remote-fetch mode ───────────────────────────────────────────────────
  /** Community UUID used to fetch members from the API when no local data is supplied. */
  communityId?: string;
  /** Initial local data supplied by server-rendered boundaries. */
  initialMembers?: readonly CommunityMember[];
  /** Alias for `members` for table-oriented consumers. */
  data?: readonly CommunityMember[];
  /** Alias for `initialMembers` for server-rendered route boundaries. */
  initialData?: readonly CommunityMember[];

  // ── Pagination ──────────────────────────────────────────────────────────
  /** Page size. Defaults to 20 and is capped at the backend's limit of 100. */
  pageSize?: number;
  /** Alias for `pageSize`, matching the API's `limit` terminology. */
  limit?: number;
  /** Alias for `pageSize` used by the existing community list components. */
  itemsPerPage?: number;
  /** Controlled 1-indexed page. Omit to let the component manage page state. */
  page?: number;
  /** Alias for `page`. */
  currentPage?: number;
  /** Initial uncontrolled page. Defaults to 1. */
  initialPage?: number;
  /** Total member count when the caller has server-side pagination metadata. */
  total?: number;
  /** Explicit total page count, useful when only pagination metadata is available. */
  totalPages?: number;
  /** Optional role filter sent to the members endpoint. */
  role?: string;
  /** Called whenever the user requests another page. */
  onPageChange?: (page: number) => void;
  /** Accessible name for the member section. */
  ariaLabel?: string;
}

interface PageMeta {
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
  offset?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function normalizePageSize(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}

function normalizeMember(value: unknown): CommunityMember {
  if (typeof value !== 'object' || value === null) {
    return { id: '', community_id: '', stellar_address: '', role: 'member', joined_at: '' };
  }
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    community_id: String(row.community_id ?? ''),
    stellar_address: String(row.stellar_address ?? row.address ?? ''),
    role: String(row.role ?? 'member') as CommunityMember['role'],
    joined_at: String(row.joined_at ?? row.joinedAt ?? ''),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders the member roster for a community.
 *
 * Supports two usage modes:
 *
 * 1. **Controlled** — pass `members`, `isLoading`, and `error` from the parent
 *    hook (`useCommunityMembers`) and the component renders the list as-is.
 *    Optional `pageSize` enables client-side pagination of the local data.
 *
 * 2. **Self-fetching** — pass `communityId` (and no `members`) to let the
 *    component fetch pages directly from the API.
 *
 * Accessibility:
 * - The section has a heading (`<h2>`) and an `aria-label` for landmark navigation.
 * - Each row uses `<li>` inside `<ul>` so screen readers announce item count.
 * - Role badges carry `srLabel="Role: "` so "Admin" reads as "Role: Admin".
 * - Loading skeletons carry a `label` on the first item so the live region fires once.
 * - Error states use `role="alert"` via the `<Alert>` primitive.
 */
export function MemberList({
  members,
  isLoading = false,
  error,
  communityId,
  initialMembers,
  data,
  initialData,
  pageSize,
  limit,
  itemsPerPage,
  page,
  currentPage,
  initialPage = 1,
  total,
  totalPages: providedTotalPages,
  role,
  onPageChange,
  ariaLabel = 'Community members',
}: MemberListProps) {
  // Resolve the source of truth for member data
  const suppliedMembers = members ?? data ?? initialMembers ?? initialData;
  const hasLocalData = suppliedMembers !== undefined;

  const resolvedPageSize = normalizePageSize(pageSize ?? itemsPerPage ?? limit);

  const initialPageValue = page ?? currentPage ?? initialPage;
  const [uncontrolledPage, setUncontrolledPage] = useState(
    Number.isFinite(initialPageValue) && initialPageValue > 0 ? Math.floor(initialPageValue) : 1
  );
  const [remoteMembers, setRemoteMembers] = useState<CommunityMember[]>([]);
  const [remoteMeta, setRemoteMeta] = useState<PageMeta | undefined>();
  const [remoteLoading, setRemoteLoading] = useState(!hasLocalData && Boolean(communityId));
  const [remoteError, setRemoteError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);

  const previousQuery = useRef({ communityId, pageSize: resolvedPageSize, role, hasLocalData });
  const queryChanged =
    previousQuery.current.communityId !== communityId ||
    previousQuery.current.pageSize !== resolvedPageSize ||
    previousQuery.current.role !== role ||
    previousQuery.current.hasLocalData !== hasLocalData;

  const localMembers = useMemo(
    () => (suppliedMembers ? [...suppliedMembers].map(normalizeMember) : []),
    [suppliedMembers]
  );

  const knownTotal = total ?? (hasLocalData ? localMembers.length : (remoteMeta?.total ?? 0));
  const calculatedTotalPages = Math.ceil(knownTotal / resolvedPageSize);
  const totalPages = Math.max(
    1,
    providedTotalPages ??
      (hasLocalData ? calculatedTotalPages : (remoteMeta?.pages ?? calculatedTotalPages))
  );

  const requestedPage = page ?? currentPage ?? uncontrolledPage;
  const normalizedRequestedPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const activePage = Math.min(
    queryChanged && page === undefined && currentPage === undefined ? 1 : normalizedRequestedPage,
    totalPages
  );

  useEffect(() => {
    if (queryChanged && page === undefined && currentPage === undefined) {
      setUncontrolledPage(1);
    }
    previousQuery.current = { communityId, pageSize: resolvedPageSize, role, hasLocalData };
  }, [communityId, currentPage, hasLocalData, page, queryChanged, resolvedPageSize, role]);

  useEffect(() => {
    if (page === undefined && currentPage === undefined && uncontrolledPage > totalPages) {
      setUncontrolledPage(totalPages);
    }
  }, [currentPage, page, totalPages, uncontrolledPage]);

  useEffect(() => {
    if (hasLocalData || !communityId) {
      setRemoteLoading(false);
      setRemoteError(null);
      setRemoteMeta(undefined);
      return;
    }

    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError(null);
    setRemoteMeta(undefined);

    const query = {
      page: activePage,
      limit: resolvedPageSize,
      ...(role ? { role } : {}),
    };

    api
      .raw<unknown[]>('GET', `/api/v1/communities/${encodeURIComponent(communityId)}/members`, {
        query,
      })
      .then((envelope: ApiEnvelope<unknown[]>) => {
        if (cancelled) return;
        const fetched = Array.isArray(envelope.data) ? envelope.data.map(normalizeMember) : [];
        setRemoteMembers(fetched);
        setRemoteMeta(envelope.meta as PageMeta | undefined);
        setRemoteError(null);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setRemoteError(requestError);
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePage, communityId, hasLocalData, resolvedPageSize, retry, role]);

  const handlePageChange = useCallback(
    (target: number) => {
      const next = Math.min(Math.max(1, Math.floor(target)), totalPages);
      if (page === undefined && currentPage === undefined) setUncontrolledPage(next);
      onPageChange?.(next);
    },
    [currentPage, onPageChange, page, totalPages]
  );

  const pagination = useMemo<UsePaginationReturn>(
    () => ({
      page: activePage,
      totalPages,
      setPage: handlePageChange,
      nextPage: () => handlePageChange(activePage + 1),
      prevPage: () => handlePageChange(activePage - 1),
      isFirstPage: activePage <= 1,
      isLastPage: activePage >= totalPages,
    }),
    [activePage, handlePageChange, totalPages]
  );

  // ── Resolve the active loading / error state ───────────────────────────────
  // The parent-prop `isLoading` / `error` take precedence when they are
  // supplied; otherwise we fall through to the remote-fetch state.
  const effectiveLoading = isLoading || remoteLoading;
  const effectiveError = error ?? (remoteError instanceof Error ? remoteError : undefined);

  // ── Visible rows for the current page ─────────────────────────────────────
  const visibleMembers = hasLocalData
    ? localMembers.slice((activePage - 1) * resolvedPageSize, activePage * resolvedPageSize)
    : remoteMembers;

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (effectiveLoading) {
    return (
      <section className={styles.section} aria-label={ariaLabel}>
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

  // ── Error state ────────────────────────────────────────────────────────────
  if (effectiveError) {
    return (
      <section className={styles.section} aria-label={ariaLabel}>
        <h2 className={styles.heading}>Members</h2>
        <Alert variant="error" title="Could not load members">
          {effectiveError.message}
        </Alert>
      </section>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (visibleMembers.length === 0 && !hasLocalData && !communityId) {
    return (
      <section className={styles.section} aria-label={ariaLabel}>
        <h2 className={styles.heading}>Members</h2>
        <EmptyState title="No members yet" message="This community has no members to display." />
      </section>
    );
  }

  if (hasLocalData && localMembers.length === 0) {
    return (
      <section className={styles.section} aria-label={ariaLabel}>
        <h2 className={styles.heading}>Members</h2>
        <EmptyState title="No members yet" message="This community has no members to display." />
      </section>
    );
  }

  if (!hasLocalData && remoteMembers.length === 0) {
    return (
      <section className={styles.section} aria-label={ariaLabel}>
        <h2 className={styles.heading}>Members</h2>
        <EmptyState title="No members yet" message="This community has no members to display." />
      </section>
    );
  }

  // ── Populated list ─────────────────────────────────────────────────────────
  return (
    <section className={styles.section} aria-label={ariaLabel}>
      <h2 className={styles.heading}>
        Members{' '}
        <span className={styles.count} aria-label={`${visibleMembers.length} members`}>
          {visibleMembers.length}
        </span>
      </h2>
      <ul className={styles.list}>
        {visibleMembers.map((member) => (
          <li key={member.id || member.stellar_address} className={styles.row}>
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
              variant={ROLE_VARIANT[member.role] ?? 'neutral'}
              size="sm"
              srLabel="Role: "
              className={styles.role}
            >
              {ROLE_LABEL[member.role] ?? member.role}
            </Badge>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <PaginationInner totalPages={totalPages} pagination={pagination} />
          <p className={styles.pageStatus} aria-live="polite">
            Page {activePage} of {totalPages}
          </p>
        </div>
      )}
    </section>
  );
}

export default MemberList;
