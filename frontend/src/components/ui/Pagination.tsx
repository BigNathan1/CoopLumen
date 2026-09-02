'use client';

import { Suspense, useCallback, useMemo } from 'react';
import { usePagination, type UsePaginationReturn } from '@/hooks/usePagination';
import styles from './Pagination.module.css';

export interface PaginationProps {
  /** Total number of pages. */
  totalPages: number;
  /**
   * Query parameter name used in the URL. Defaults to `page`.
   * Ignored when `onPageChange` is provided (controlled mode).
   */
  paramName?: string;
  /**
   * Controlled page (1-indexed). When provided, the component does not read
   * from or write to the URL — use `onPageChange` to handle navigation.
   */
  page?: number;
  /** Called when the user requests a different page. Required in controlled mode. */
  onPageChange?: (page: number) => void;
  /** Class applied to the outer `<nav>` element. */
  className?: string;
  /**
   * Maximum number of page buttons to show. Ellipsis replaces buttons that
   * fall outside this window. Defaults to 7.
   */
  maxVisible?: number;
}

/**
 * Generates the list of page numbers and ellipsis markers to render.
 *
 * The algorithm always shows: first page, last page, the current page, and
 * up to `siblingCount` pages on either side of the current page. Any gaps
 * are collapsed into a single `…` marker.
 */
function buildPageRange(current: number, total: number, maxVisible: number): (number | '…')[] {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const siblingCount = Math.max(0, Math.floor((maxVisible - 4) / 2));
  const left = Math.max(2, current - siblingCount);
  const right = Math.min(total - 1, current + siblingCount);

  const pages: (number | '…')[] = [1];

  if (left > 2) pages.push('…');

  for (let i = left; i <= right; i++) {
    pages.push(i);
  }

  if (right < total - 1) pages.push('…');

  pages.push(total);

  return pages;
}

export interface PaginationInnerProps extends PaginationProps {
  /** Internal: the resolved pagination state. */
  pagination?: UsePaginationReturn;
}

/**
 * Inner Pagination renderer extracted so the outer component can wrap it in
 * `Suspense` when using the URL-synced hook, while tests can render it
 * directly with a controlled `pagination` prop.
 */
export function PaginationInner({
  totalPages,
  page: controlledPage,
  onPageChange,
  className,
  maxVisible = 7,
  pagination,
}: PaginationInnerProps) {
  const p = pagination;
  const current = p ? p.page : (controlledPage ?? 1);
  const total = p ? p.totalPages : Math.max(1, totalPages);

  const handlePageChange = useCallback(
    (target: number) => {
      if (p) {
        p.setPage(target);
      } else {
        onPageChange?.(target);
      }
    },
    [p, onPageChange]
  );

  const pages = useMemo(
    () => buildPageRange(current, total, maxVisible),
    [current, total, maxVisible]
  );

  return (
    <nav aria-label="Pagination" className={[styles.nav, className].filter(Boolean).join(' ')}>
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            className={styles.button}
            disabled={current <= 1}
            aria-label="Go to previous page"
            onClick={() => handlePageChange(current - 1)}
          >
            Prev
          </button>
        </li>

        {pages.map((item, index) =>
          item === '…' ? (
            <li key={`ellipsis-${index}`} aria-hidden="true">
              <span className={styles.ellipsis}>…</span>
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={[styles.button, item === current ? styles.active : null]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={`Page ${item}`}
                aria-current={item === current ? 'page' : undefined}
                onClick={() => handlePageChange(item)}
              >
                {item}
              </button>
            </li>
          )
        )}

        <li>
          <button
            type="button"
            className={styles.button}
            disabled={current >= total}
            aria-label="Go to next page"
            onClick={() => handlePageChange(current + 1)}
          >
            Next
          </button>
        </li>
      </ul>
    </nav>
  );
}

/**
 * A pagination control synchronised with the URL `page` query parameter
 * through {@link usePagination}.
 *
 * Must be rendered inside a Next.js `Suspense` boundary because the hook
 * calls `useSearchParams`.
 *
 * @example
 * ```tsx
 * <Suspense fallback={<span>Loading pages…</span>}>
 *   <Pagination totalPages={20} />
 * </Suspense>
 * ```
 */
export function Pagination({
  paramName,
  totalPages,
  className,
  maxVisible,
}: Omit<PaginationProps, 'page' | 'onPageChange'> & { paramName?: string }) {
  const pagination = usePagination({ paramName, totalPages });

  return (
    <Suspense fallback={<span className={styles.navLabel}>Loading pagination</span>}>
      <PaginationInner
        totalPages={totalPages}
        paramName={paramName}
        className={className}
        maxVisible={maxVisible}
        pagination={pagination}
      />
    </Suspense>
  );
}
