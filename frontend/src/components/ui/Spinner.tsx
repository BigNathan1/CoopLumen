'use client';

import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import styles from './Spinner.module.css';

/** Predefined size presets. */
export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends Omit<ComponentPropsWithoutRef<'span'>, 'role'> {
  /** Visual size of the spinner. Defaults to `md`. */
  size?: SpinnerSize;
  /**
   * Accessible label announced while the spinner is visible. When omitted
   * the spinner is decorative (`aria-hidden`).
   */
  label?: string;
  /**
   * Overrides the default colour. Accepts any CSS colour value. When omitted
   * the spinner inherits `currentColor` from its parent.
   */
  color?: string;
}

const SIZE_CLASS: Record<SpinnerSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

/**
 * An animated loading spinner that inherits its colour from the surrounding
 * context via `currentColor`, or accepts an explicit `color` override.
 *
 * Styling comes entirely from the `globals.css` design tokens, so a theme
 * change moves every spinner at once.
 *
 * Accessibility notes:
 *
 * - When a `label` is provided the spinner is announced once through a polite
 *   live region (`role="status"`), so assistive technology knows content is
 *   loading without the spinner interrupting on every animation frame.
 * - Without a `label` the spinner is `aria-hidden` — a parent component that
 *   already announces loading (e.g. a button with `aria-busy`) should own the
 *   announcement instead of duplicating it.
 * - The animation is slowed under `prefers-reduced-motion: reduce` so users
 *   who have requested reduced motion are not distracted, while the spinner
 *   still communicates that work is happening.
 * - `data-size` is mirrored onto the element so tests and custom layouts can
 *   target the spinner without depending on generated CSS-module class names.
 *
 * @example
 * ```tsx
 * // Standalone, announced to screen readers
 * <Spinner label="Loading balances" />
 *
 * // Inside a button that already announces via aria-busy
 * <Button isLoading loadingLabel="Saving…">
 *   Save
 * </Button>
 * ```
 */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', label, color, className, style, ...spanProps },
  ref
) {
  const isDecorative = !label;

  return (
    <span
      {...(isDecorative ? { 'aria-hidden': true } : { role: 'status', 'aria-live': 'polite' })}
      ref={ref}
      className={[styles.spinner, SIZE_CLASS[size], className].filter(Boolean).join(' ')}
      data-size={size}
      style={color ? { ...style, color } : style}
      {...spanProps}
    >
      {!isDecorative && <span className={styles.srOnly}>{label}</span>}
    </span>
  );
});
