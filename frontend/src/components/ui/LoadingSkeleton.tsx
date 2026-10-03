'use client';

import type { CSSProperties } from 'react';
import styles from './LoadingSkeleton.module.css';

export type SkeletonVariant = 'text' | 'circle' | 'rect';

export interface LoadingSkeletonProps {
  /** Placeholder shape. `text` sizes itself from the surrounding font size. */
  variant?: SkeletonVariant;
  /** CSS width. Numbers are treated as pixels. */
  width?: number | string;
  /** CSS height. Numbers are treated as pixels. Ignored for `circle`, which uses `size`. */
  height?: number | string;
  /** Diameter for the `circle` variant. Numbers are treated as pixels. */
  size?: number | string;
  /** How many placeholder lines to render. */
  count?: number;
  /** Gap between lines when `count` is greater than 1. Numbers are pixels. */
  gap?: number | string;
  /** Corner radius override. Numbers are treated as pixels. */
  radius?: number | string;
  /**
   * Width of the final line for multi-line `text` skeletons, so a paragraph
   * placeholder does not end in a suspiciously straight edge.
   */
  lastLineWidth?: number | string;
  /** Accessible name announced while content loads. */
  label?: string;
  /**
   * Set when an ancestor already announces the loading state. The skeleton is
   * then removed from the accessibility tree so screen readers hear it once.
   */
  decorative?: boolean;
  /** Renders the group inline (for placeholders inside a line of text). */
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Test hook forwarded to the wrapper element. */
  'data-testid'?: string;
}

/** Numbers are pixel values; strings pass through as authored CSS. */
function toCssLength(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Animated shimmer placeholder shown while content loads.
 *
 * Rendering a skeleton instead of a spinner keeps the page from collapsing and
 * reflowing when data arrives, so the layout a reader sees while waiting is the
 * layout they end up with.
 *
 * Colours come from the `--color-skeleton-*` custom properties in
 * `globals.css`, which are derived from the surface and border tokens with
 * `color-mix`. They therefore follow any theme change without this component
 * hard-coding a single palette.
 *
 * Accessibility:
 * - The group is a polite live region (`role="status"`, `aria-busy="true"`)
 *   with a visually hidden label, so assistive tech announces the wait once
 *   rather than reading meaningless placeholder boxes.
 * - Individual bars are `aria-hidden` because they carry no information.
 * - The shimmer is disabled under `prefers-reduced-motion: reduce`.
 * - Pass `decorative` when a parent already announces loading, to avoid a
 *   duplicate announcement.
 *
 * @example
 * ```tsx
 * <LoadingSkeleton variant="text" count={3} label="Loading communities" />
 * <LoadingSkeleton variant="circle" size={40} decorative />
 * ```
 */
export function LoadingSkeleton({
  variant = 'text',
  width,
  height,
  size,
  count = 1,
  gap = 8,
  radius,
  lastLineWidth,
  label = 'Loading',
  decorative = false,
  inline = false,
  className,
  style,
  'data-testid': testId,
}: LoadingSkeletonProps) {
  const lines = Math.max(1, Math.floor(count));
  const isCircle = variant === 'circle';
  const diameter = toCssLength(size);

  const groupClassName = [styles.group, inline ? styles.inline : null, className]
    .filter(Boolean)
    .join(' ');

  const accessibilityProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'status', 'aria-live': 'polite', 'aria-busy': true } as const);

  return (
    <div
      {...accessibilityProps}
      className={groupClassName}
      style={{ gap: toCssLength(gap), ...style }}
      data-testid={testId}
    >
      {Array.from({ length: lines }, (_, index) => {
        const isLastOfMany = lines > 1 && index === lines - 1;
        const lineWidth =
          isLastOfMany && variant === 'text' && lastLineWidth !== undefined ? lastLineWidth : width;

        return (
          <span
            key={index}
            aria-hidden="true"
            data-skeleton-variant={variant}
            className={[styles.skeleton, styles[variant]].filter(Boolean).join(' ')}
            style={{
              width: isCircle ? (diameter ?? toCssLength(lineWidth)) : toCssLength(lineWidth),
              height: isCircle ? (diameter ?? toCssLength(height)) : toCssLength(height),
              borderRadius: toCssLength(radius),
            }}
          />
        );
      })}
      {!decorative && <span className={styles.srOnly}>{label}</span>}
    </div>
  );
}
