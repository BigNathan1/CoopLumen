'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiEnvelope } from '@/lib/api';
import type { UsePaginationReturn } from '@/hooks/usePagination';
import { Alert } from './ui/Alert';
import { Badge, type BadgeVariant } from './ui/Badge';
import { Button } from './ui/Button';
import { LoadingSkeleton } from './ui/LoadingSkeleton';
import { PaginationInner } from './ui/Pagination';
import { Table, type TableColumn } from './ui/Table';
import styles from './MemberList.module.css';

/** A member row returned by `GET /api/v1/communities/:id/members`. */
export interface CommunityMember {
  stellar_address: string;
  role: string;
  joined_at: string;
}

/** Short alias for consumers that refer to a row simply as a member. */
export type Member = CommunityMember;

type MemberRow = CommunityMember & Record<string, unknown>;

export interface MemberListProps {
  /** Community UUID used to fetch members when no local data is supplied. */
  communityId?: string;
  /** Server-provided members. Supplying this makes the component data-driven. */
  members?: readonly CommunityMember[];
  /** Initial local data, equivalent to `members` for a route/component boundary. */
  initialMembers?: readonly CommunityMember[];
  /** Alias for `members` for table-oriented consumers. */
  data?: readonly CommunityMember[];
  /** Alias for `initialMembers` for server-rendered route boundaries. */
  initialData?: readonly CommunityMember[];
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
  /** Accessible name for the member table. */
  ariaLabel?: string;
}

interface PageMeta {
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
  offset?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  member: 'Member',
  observer: 'Observer',
};

const ROLE_VARIANTS: Record<string, BadgeVariant> = {
  admin: 'info',
  treasurer: 'success',
  member: 'neutral',
  observer: 'warning',
};

function normalizePageSize(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}

function normalizeMember(value: unknown): CommunityMember {
  if (typeof value !== 'object' || value === null) {
    return { stellar_address: '', role: 'member', joined_at: '' };
  }

  const row = value as Record<string, unknown>;
  return {
    stellar_address: String(row.stellar_address ?? row.address ?? ''),
    role: String(row.role ?? 'member'),
    joined_at: String(row.joined_at ?? row.joinedAt ?? ''),
  };
}

function normalizedMemberDate(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Formats a backend timestamp deterministically in UTC for the member table. */
export function formatMemberJoinDate(value: string): string {
  const date = normalizedMemberDate(value);
  if (!date) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function memberRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function memberRoleVariant(role: string): BadgeVariant {
  return ROLE_VARIANTS[role] ?? 'neutral';
}

/**
 * Paginated community member directory.
 *
 * The component supports both modes used by the app: a route can provide
 * `communityId` and let it fetch the current page from the API, while a
 * server-rendered detail page can pass `members` and paginate them locally.
 * The same address, role, and joined-date presentation is used in either mode.
 */
export function MemberList({
  communityId,
  members,
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
}: MemberListProps): React.JSX.Element {
  const suppliedMembers = members ?? data ?? initialMembers ?? initialData;
  const hasLocalData = suppliedMembers !== undefined;
  const resolvedPageSize = normalizePageSize(pageSize ?? itemsPerPage ?? limit);
  const initialPageValue = page ?? currentPage ?? initialPage;
  const [uncontrolledPage, setUncontrolledPage] = useState(
    Number.isFinite(initialPageValue) && initialPageValue > 0 ? Math.floor(initialPageValue) : 1
  );
  const [remoteMembers, setRemoteMembers] = useState<CommunityMember[]>([]);
  const [remoteMeta, setRemoteMeta] = useState<PageMeta | undefined>();
  const [loading, setLoading] = useState(!hasLocalData && Boolean(communityId));
  const [error, setError] = useState<unknown>(null);
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
      setLoading(false);
      setError(null);
      setRemoteMeta(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
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
        const data = Array.isArray(envelope.data) ? envelope.data.map(normalizeMember) : [];
        setRemoteMembers(data);
        setRemoteMeta(envelope.meta as PageMeta | undefined);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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

  const visibleMembers = hasLocalData
    ? localMembers.slice((activePage - 1) * resolvedPageSize, activePage * resolvedPageSize)
    : remoteMembers;
  const rows: MemberRow[] = visibleMembers.map((member) => ({ ...member }));

  const columns = useMemo<TableColumn<MemberRow>[]>(
    () => [
      {
        key: 'stellar_address',
        label: 'Address',
        render: (_value, member) => (
          <code className={styles.address} title={member.stellar_address}>
            {member.stellar_address || 'Unknown address'}
          </code>
        ),
      },
      {
        key: 'role',
        label: 'Role',
        render: (_value, member) => (
          <Badge variant={memberRoleVariant(member.role)} size="sm" data-role={member.role}>
            {memberRoleLabel(member.role)}
          </Badge>
        ),
      },
      {
        key: 'joined_at',
        label: 'Join date',
        render: (_value, member) => {
          const dateTime = normalizedMemberDate(member.joined_at)?.toISOString();
          return <time dateTime={dateTime}>{formatMemberJoinDate(member.joined_at)}</time>;
        },
      },
    ],
    []
  );

  let content: React.ReactNode;
  if (loading) {
    content = (
      <div className={styles.loading}>
        <LoadingSkeleton variant="text" count={4} label="Loading community members" />
      </div>
    );
  } else if (error) {
    content = (
      <Alert variant="error" title="Unable to load members">
        <p>{error instanceof Error ? error.message : 'Please try again.'}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)}>
          Retry
        </Button>
      </Alert>
    );
  } else {
    content = (
      <Table
        columns={columns}
        data={rows}
        ariaLabel={ariaLabel}
        emptyMessage="No members found"
        compact
      />
    );
  }

  return (
    <section className={styles.wrapper} aria-label="Member directory">
      {content}
      {!loading && !error && totalPages > 1 && (
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
