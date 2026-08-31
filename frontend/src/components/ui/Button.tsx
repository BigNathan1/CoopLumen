'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import styles from './Button.module.css';

/** Visual weight of the button, in descending order of emphasis. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Control height and padding scale. */
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  danger: styles.danger,
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** Emphasis of the action. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Size of the control. Defaults to `md`. */
  size?: ButtonSize;
  /** Stretches the button to the width of its container. */
  fullWidth?: boolean;
  /**
   * Marks the action as in flight: the button is disabled, reports `aria-busy`
   * and renders a spinner in place of any leading icon.
   */
  isLoading?: boolean;
  /** Announced while `isLoading` is set. Defaults to `Loading`. */
  loadingLabel?: string;
  /** Decorative element rendered before the label. */
  leftIcon?: ReactNode;
  /** Decorative element rendered after the label. */
  rightIcon?: ReactNode;
}

/**
 * The single button primitive every screen should reach for.
 *
 * Styling comes entirely from the `globals.css` design tokens, so a theme
 * change moves every button at once instead of leaving one-off colours behind.
 *
 * Accessibility notes:
 *
 * - `type` defaults to `button`. The native default is `submit`, which makes a
 *   stray button inside a form submit it by accident.
 * - Icons are `aria-hidden`; they duplicate the label rather than adding to it.
 *   An icon-only button therefore needs an `aria-label` from the caller.
 * - While loading the button is disabled *and* `aria-busy`, and the wait is
 *   announced through a polite live region rather than by silently swapping the
 *   label out from under the reader.
 * - Focus is shown with a token-coloured ring on `:focus-visible`, so keyboard
 *   users keep a visible focus order while mouse users are not distracted.
 *
 * `data-variant` and `data-size` are mirrored onto the element so surrounding
 * layouts (and tests) can target a button by its role without depending on
 * generated CSS-module class names.
 *
 * @example
 * ```tsx
 * <Button variant="danger" size="sm" onClick={remove}>Remove member</Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    isLoading = false,
    loadingLabel = 'Loading',
    leftIcon,
    rightIcon,
    type = 'button',
    disabled,
    className,
    children,
    ...buttonProps
  },
  ref
) {
  const classes = [
    styles.button,
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? styles.fullWidth : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      className={classes}
      data-variant={variant}
      data-size={size}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? (
        <span aria-hidden="true" className={styles.spinner} />
      ) : (
        leftIcon && (
          <span aria-hidden="true" className={styles.icon}>
            {leftIcon}
          </span>
        )
      )}

      {children}

      {rightIcon && !isLoading && (
        <span aria-hidden="true" className={styles.icon}>
          {rightIcon}
        </span>
      )}

      <span role="status" className={styles.srOnly}>
        {isLoading ? loadingLabel : ''}
      </span>
    </button>
  );
});
