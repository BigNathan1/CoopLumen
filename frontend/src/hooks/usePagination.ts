'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export interface UsePaginationOptions {
  /** Query parameter name. Defaults to `page`. */
  paramName?: string;
  /** Total number of pages. Required to clamp values. */
  totalPages: number;
}

export interface UsePaginationReturn {
  /** Current page (1-indexed). Always a valid integer within [1, totalPages]. */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Navigate to a specific page. Clamped to [1, totalPages]. */
  setPage: (page: number) => void;
  /** Navigate to the next page. No-op on the last page. */
  nextPage: () => void;
  /** Navigate to the previous page. No-op on the first page. */
  prevPage: () => void;
  /** Whether the current page is the first page. */
  isFirstPage: boolean;
  /** Whether the current page is the last page. */
  isLastPage: boolean;
}

/**
 * Derives a valid integer page number from a URL search param string.
 * Returns 1 when the value is missing, non-numeric, zero, or negative.
 */
function parsePage(value: string | null, totalPages: number): number {
  const parsed = Number(value);
  const page = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  return Math.min(page, Math.max(1, totalPages));
}

/**
 * Reads and writes a `page` query parameter in the URL, keeping the
 * pagination state synchronised across browser history, deep links, and
 * back/forward navigation.
 *
 * The hook must be rendered inside a Next.js `Suspense` boundary because
 * `useSearchParams` triggers one in the App Router.
 *
 * @example
 * ```tsx
 * const { page, totalPages, setPage, nextPage, prevPage } = usePagination({
 *   totalPages: 10,
 * });
 * ```
 */
export function usePagination({
  paramName = 'page',
  totalPages,
}: UsePaginationOptions): UsePaginationReturn {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const clampedTotal = Math.max(1, totalPages);
  const page = parsePage(searchParams.get(paramName), clampedTotal);

  const setPage = useCallback(
    (target: number) => {
      const next = Math.min(Math.max(1, Math.floor(target)), clampedTotal);
      const params = new URLSearchParams(searchParams.toString());

      if (next === 1) {
        params.delete(paramName);
      } else {
        params.set(paramName, String(next));
      }

      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [clampedTotal, paramName, pathname, router, searchParams]
  );

  const nextPage = useCallback(() => {
    if (page < clampedTotal) setPage(page + 1);
  }, [page, clampedTotal, setPage]);

  const prevPage = useCallback(() => {
    if (page > 1) setPage(page - 1);
  }, [page, setPage]);

  const isFirstPage = page <= 1;
  const isLastPage = page >= clampedTotal;

  return useMemo(
    () => ({
      page,
      totalPages: clampedTotal,
      setPage,
      nextPage,
      prevPage,
      isFirstPage,
      isLastPage,
    }),
    [page, clampedTotal, setPage, nextPage, prevPage, isFirstPage, isLastPage]
  );
}
