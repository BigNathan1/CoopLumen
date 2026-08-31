'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import styles from './Badge.module.css';

/** Semantic colour of the badge, mapping to the corresponding design token. */
export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** Control height and font-size scale. */
export type BadgeSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: styles.success,
  warning: styles.warning,
  error: styles.error,
  info: styles.info,
  neutral: styles.neutral,
};

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

export interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
  /** Semantic colour. Defaults to `neutral`. */
  variant?: BadgeVariant;
  /** Size of the badge. Defaults to `md`. */
  size?: BadgeSize;
  /** Shows a small coloured dot before the label. */
  dot?: boolean;
  /** Decorative element rendered before the label. */
  icon?: ReactNode;
  /** Screen-reader-only text announced before the visible label. */
  srLabel?: string;
}

/**
 * A small inline label for status, category, or metadata.
 *
 * Styling comes entirely from the `globals.css` design tokens, so a theme
 * change moves every badge at once instead of leaving one-off colours behind.
 *
 * Accessibility notes:
 *
 * - `srLabel` prepends screen-reader-only text to the visible label, so a
 *   short visible badge ("Active") can carry a fuller spoken form
 *   ("Status: active") without lengthening the layout.
 * - Decorative icons and the dot indicator are `aria-hidden` so they do not
 *   add noise to the accessible tree.
 * - `data-variant` and `data-size` are mirrored onto the element so
 *   surrounding layouts and tests can target a badge by its role without
 *   depending on generated CSS-module class names.
 *
 * @example
 * ```tsx
 * <Badge variant="success" size="sm">Active</Badge>
 * <Badge variant="error" dot>Overdue</Badge>
 * <Badge variant="info" icon={<InfoIcon />}>New</Badge>
 * ```
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    variant = 'neutral',
    size = 'md',
    dot = false,
    icon,
    srLabel,
    className,
    children,
    ...spanProps
  },
  ref
) {
  const classes = [styles.badge, VARIANT_CLASS[variant], SIZE_CLASS[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <span {...spanProps} ref={ref} className={classes} data-variant={variant} data-size={size}>
      {dot && <span aria-hidden="true" className={styles.dot} />}

      {icon && !dot && (
        <span aria-hidden="true" className={styles.icon}>
          {icon}
        </span>
      )}

      {srLabel && <span className={styles.srOnly}>{srLabel}</span>}

      {children}
    </span>
  );
});
