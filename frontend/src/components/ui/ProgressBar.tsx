'use client';

import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import styles from './ProgressBar.module.css';

/** Visual color tone representing state or context (e.g., quorum achieved, loan on track, overdue). */
export type ProgressBarVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

/** Height and thickness scale of the progress bar track. */
export type ProgressBarSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ProgressBarVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
  info: styles.info,
};

const SIZE_CLASS: Record<ProgressBarSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

export interface ProgressBarProps extends ComponentPropsWithoutRef<'div'> {
  /** Current progress value. Clamped between `min` and `max`. */
  value?: number;
  /** Maximum progress value. Defaults to `100`. */
  max?: number;
  /** Minimum progress value. Defaults to `0`. */
  min?: number;
  /** Visual variant tone. Defaults to `'primary'`. */
  variant?: ProgressBarVariant;
  /** Height scale of the track. Defaults to `'md'`. */
  size?: ProgressBarSize;
  /**
   * Visible or accessible label (e.g. "Loan repayment", "Governance quorum").
   * When provided, it is connected to the progressbar via `aria-labelledby` or `aria-label`.
   */
  label?: ReactNode;
  /** Visually hides the label while preserving it for assistive technology. */
  hideLabel?: boolean;
  /** Whether to render the formatted value alongside the label. Defaults to `false`. */
  showValue?: boolean;
  /**
   * Custom formatter function for the value display and `aria-valuetext`.
   * Defaults to percentage formatted string (e.g. "65%").
   */
  valueFormatter?: (value: number, max: number, min: number, percentage: number) => ReactNode;
  /** Explanatory helper text displayed below the progress bar. */
  helperText?: ReactNode;
  /**
   * Optional threshold mark (as a value between `min` and `max`) to indicate a target or minimum
   * requirement (such as a governance quorum percentage or loan payoff milestone).
   */
  threshold?: number;
  /** Accessible label describing the threshold (e.g., "Quorum target: 60%"). */
  thresholdLabel?: string;
  /** Sets indeterminate animation state when current progress is unknown or pending. */
  indeterminate?: boolean;
  /** Additional CSS class applied to the outer container. */
  containerClassName?: string;
}

/**
 * A flexible, accessible progress bar component designed for loan repayment schedules,
 * treasury utilization, and governance quorum tracking.
 *
 * Accessibility notes:
 * - Implements WAI-ARIA `role="progressbar"` with `aria-valuenow`, `aria-valuemin`,
 *   `aria-valuemax`, and `aria-valuetext`.
 * - When `indeterminate` is true, `aria-valuenow` is omitted as per the ARIA specification.
 * - Labels are associated via `aria-labelledby` when a rendered text label exists or `aria-label`.
 * - Threshold indicators include `aria-hidden` visual markers and title attributes for tooltips.
 * - Motion obeys `prefers-reduced-motion`.
 *
 * @example
 * ```tsx
 * // Governance quorum progress
 * <ProgressBar
 *   label="Quorum Status"
 *   value={6400}
 *   max={10000}
 *   threshold={5000}
 *   variant="success"
 *   showValue
 * />
 * ```
 */
export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(function ProgressBar(
  {
    value = 0,
    max = 100,
    min = 0,
    variant = 'primary',
    size = 'md',
    label,
    hideLabel = false,
    showValue = false,
    valueFormatter,
    helperText,
    threshold,
    thresholdLabel,
    indeterminate = false,
    containerClassName,
    className,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-valuetext': ariaValueTextProp,
    ...restProps
  },
  ref
) {
  const reactId = useId();
  const progressId = id ?? `${reactId}-progressbar`;
  const labelId = `${progressId}-label`;
  const helperId = `${progressId}-helper`;

  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 100;
  const clampedValue = Math.min(Math.max(value, safeMin), safeMax);
  const range = safeMax - safeMin;
  const percentage = range > 0 ? ((clampedValue - safeMin) / range) * 100 : 0;

  const defaultFormattedPercentage = `${Math.round(percentage)}%`;
  const formattedValue = valueFormatter
    ? valueFormatter(clampedValue, safeMax, safeMin, percentage)
    : defaultFormattedPercentage;

  const ariaValueText =
    ariaValueTextProp ??
    (typeof formattedValue === 'string' ? formattedValue : defaultFormattedPercentage);

  const thresholdPercent =
    threshold !== undefined && Number.isFinite(threshold)
      ? Math.min(Math.max(((threshold - safeMin) / range) * 100, 0), 100)
      : undefined;

  const labelledBy =
    [ariaLabelledBy, label ? labelId : null].filter(Boolean).join(' ') || undefined;

  const resolvedAriaLabel = labelledBy
    ? undefined
    : (ariaLabel ?? (typeof label === 'string' ? label : undefined));

  return (
    <div className={[styles.field, containerClassName].filter(Boolean).join(' ')}>
      {(label || showValue) && (
        <div className={styles.header}>
          {label && (
            <span
              id={labelId}
              className={[styles.label, hideLabel ? styles.srOnly : null].filter(Boolean).join(' ')}
            >
              {label}
            </span>
          )}
          {showValue && !indeterminate && (
            <span className={styles.valueText} aria-hidden="true">
              {formattedValue}
            </span>
          )}
        </div>
      )}

      <div
        {...restProps}
        ref={ref}
        id={progressId}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : clampedValue}
        aria-valuemin={safeMin}
        aria-valuemax={safeMax}
        aria-valuetext={indeterminate ? undefined : ariaValueText}
        aria-label={resolvedAriaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={helperText ? helperId : undefined}
        data-variant={variant}
        data-size={size}
        data-indeterminate={indeterminate || undefined}
        className={[
          styles.track,
          SIZE_CLASS[size],
          VARIANT_CLASS[variant],
          indeterminate ? styles.indeterminate : null,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className={styles.fill}
          style={{ width: indeterminate ? undefined : `${percentage}%` }}
        />

        {thresholdPercent !== undefined && (
          <div
            className={styles.thresholdMarker}
            style={{ left: `${thresholdPercent}%` }}
            title={thresholdLabel ?? `Threshold: ${threshold}`}
            aria-hidden="true"
          />
        )}
      </div>

      {helperText && (
        <span id={helperId} className={styles.helper}>
          {helperText}
        </span>
      )}
    </div>
  );
});
