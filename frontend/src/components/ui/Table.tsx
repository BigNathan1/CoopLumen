'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import styles from './Table.module.css';

export type SortDirection = 'asc' | 'desc';

export interface TableColumn<T extends Record<string, unknown>> {
  /** Key used to access the cell value from the row data. */
  key: string;
  /** Accessible header label. */
  label: string;
  /** Whether this column can be sorted. Defaults to `false`. */
  sortable?: boolean;
  /** Custom render function for cell content. Falls back to `String(value)`. */
  render?: (value: unknown, row: T, index: number) => ReactNode;
  /** Custom render function for header content. */
  renderHeader?: (column: TableColumn<T>) => ReactNode;
  /** Additional CSS class applied to every cell in this column. */
  className?: string;
  /** Additional CSS class applied to the header cell. */
  headerClassName?: string;
}

export interface TableProps<T extends Record<string, unknown>> {
  /** Column definitions. */
  columns: TableColumn<T>[];
  /** Row data. Each item is a record keyed by the column `key`. */
  data: T[];
  /** Key of the currently sorted column. */
  sortKey?: string;
  /** Current sort direction. Defaults to `asc`. */
  sortDirection?: SortDirection;
  /** Called when a sortable header is clicked with the column key. */
  onSort?: (key: string) => void;
  /**
   * Content shown when `data` is empty. When omitted, a default empty state
   * is rendered using `emptyMessage`.
   */
  emptyState?: ReactNode;
  /** Message shown in the default empty state. Defaults to `No data to display`. */
  emptyMessage?: string;
  /** Accessible label for the table. Defaults to `Data table`. */
  ariaLabel?: string;
  /** Class applied to the wrapping `<div>` element. */
  className?: string;
  /** Whether rows should use compact padding. Defaults to `false`. */
  compact?: boolean;
}

/**
 * Sort indicator arrow rendered inside sortable column headers.
 * `aria-hidden` because the sort direction is communicated through
 * `aria-sort` on the header cell.
 */
function SortIcon({ direction }: { direction?: SortDirection }) {
  return (
    <span aria-hidden="true" className={styles.sortIcon} data-direction={direction}>
      {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '⇅'}
    </span>
  );
}

/**
 * A data table with sortable column headers and an empty state.
 *
 * Styling comes entirely from the `globals.css` design tokens, so a theme
 * change moves every table at once. The component renders a semantic `<table>`
 * with proper `<thead>` / `<tbody>` structure so assistive technology can
 * navigate it naturally.
 *
 * Accessibility notes:
 *
 * - Sortable columns use `<button>` elements inside `<th>`, so they are
 *   keyboard reachable and announced as interactive controls.
 * - `aria-sort` is set on the active sort column (`ascending`, `descending`,
 *   or `none`), and omitted from non-sortable columns.
 * - The empty state uses `colspan` across all columns so the table structure
 *   remains valid.
 * - `data-sortable`, `data-sort-key`, `data-direction`, and `data-active`
 *   attributes are mirrored for tests and custom styling.
 *
 * @example
 * ```tsx
 * <Table
 *   columns={[
 *     { key: 'name', label: 'Name', sortable: true },
 *     { key: 'email', label: 'Email' },
 *   ]}
 *   data={[{ name: 'Alice', email: 'alice@example.com' }]}
 *   sortKey="name"
 *   sortDirection="asc"
 *   onSort={(key) => setSortKey(key)}
 *   emptyMessage="No members found"
 * />
 * ```
 */
export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  sortKey,
  sortDirection = 'asc',
  onSort,
  emptyState,
  emptyMessage = 'No data to display',
  ariaLabel = 'Data table',
  className,
  compact = false,
}: TableProps<T>) {
  const handleSort = useCallback(
    (key: string) => {
      onSort?.(key);
    },
    [onSort]
  );

  const headerSortState = useMemo(
    () =>
      new Map(
        columns.map((col) => {
          if (!col.sortable) return [col.key, undefined];
          if (sortKey === col.key) return [col.key, sortDirection];
          return [col.key, undefined as SortDirection | undefined];
        })
      ),
    [columns, sortKey, sortDirection]
  );

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <table
        className={[styles.table, compact ? styles.compact : null].filter(Boolean).join(' ')}
        aria-label={ariaLabel}
        data-compact={compact || undefined}
      >
        <thead className={styles.thead}>
          <tr>
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const dir = headerSortState.get(col.key);
              const ariaSort = col.sortable
                ? isSorted
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                : undefined;

              return (
                <th
                  key={col.key}
                  className={[styles.th, col.headerClassName].filter(Boolean).join(' ')}
                  aria-sort={ariaSort}
                  data-sortable={col.sortable || undefined}
                  data-sort-key={col.sortable ? col.key : undefined}
                  data-active={isSorted || undefined}
                  scope="col"
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => handleSort(col.key)}
                      aria-label={`Sort by ${col.label}${isSorted ? `, currently ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                    >
                      {col.renderHeader ? col.renderHeader(col) : col.label}
                      <SortIcon direction={dir} />
                    </button>
                  ) : (
                    <span className={styles.thContent}>
                      {col.renderHeader ? col.renderHeader(col) : col.label}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className={styles.tbody}>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.emptyCell}>
                {emptyState ?? <span className={styles.emptyMessage}>{emptyMessage}</span>}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr key={rowIndex} className={styles.row}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[styles.td, col.className].filter(Boolean).join(' ')}
                  >
                    {col.render
                      ? col.render(row[col.key], row, rowIndex)
                      : row[col.key] != null
                        ? String(row[col.key])
                        : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
