'use client';

import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'size'> {
  /** Visible label text, associated with the checkbox via `htmlFor`. */
  label: string;
  /**
   * Hides the label visually while keeping it for assistive technology.
   * Use only where the surrounding context already names the control.
   */
  hideLabel?: boolean;
  /** Hint rendered below the control. */
  helperText?: ReactNode;
  /**
   * Validation message. Any non-empty string puts the field in its error
   * state; pass `true` to style as invalid without a message of its own.
   */
  error?: string | boolean;
  /** Marks the field required, visually and through `aria-required`. */
  required?: boolean;
  /** Class applied to the wrapping field element rather than the control. */
  containerClassName?: string;
}

/**
 * A labelled checkbox with accessible name, helper text and error state.
 *
 * Accessibility notes:
 *
 * - The visible label is always rendered and associated through `htmlFor`, so
 *   clicking it toggles the checkbox. `hideLabel` hides it visually only.
 * - `aria-describedby` points at the helper text, the error, or both.
 * - `aria-invalid` is set while the field has an error, and the message is a
 *   `role="alert"` so it is announced when it appears.
 * - `aria-required` is set alongside the native `required` attribute.
 * - The checkbox is reachable by keyboard (Tab to focus, Space to toggle).
 * - Supports the `indeterminate` state via a React ref; visually and
 *   programmatically distinct from checked/unchecked.
 *
 * @example
 * ```tsx
 * <Checkbox label="I agree to the terms" required />
 * ```
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    hideLabel = false,
    helperText,
    error,
    required = false,
    containerClassName,
    id,
    className,
    'aria-describedby': ariaDescribedBy,
    disabled,
    onChange,
    ...inputProps
  },
  ref
) {
  const reactId = useId();
  const inputId = id ?? `${reactId}-checkbox`;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  const errorMessage = typeof error === 'string' && error.length > 0 ? error : undefined;
  const hasError = Boolean(error);

  const describedBy =
    [ariaDescribedBy, helperText ? helperId : null, errorMessage ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  const labelClasses = [styles.label, hideLabel ? styles.srOnly : null].filter(Boolean).join(' ');

  return (
    <div className={[styles.field, containerClassName].filter(Boolean).join(' ')}>
      <input
        {...inputProps}
        ref={ref}
        id={inputId}
        type="checkbox"
        required={required}
        disabled={disabled}
        className={[styles.input, className].filter(Boolean).join(' ')}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        onChange={onChange}
      />

      <div>
        <label htmlFor={inputId} className={labelClasses}>
          {label}
          {required && (
            <span aria-hidden="true" className={styles.srOnly}>
              (required)
            </span>
          )}
        </label>

        {(helperText || errorMessage) && (
          <div className={styles.messages}>
            {helperText && (
              <span id={helperId} className={styles.helper}>
                {helperText}
              </span>
            )}

            {errorMessage && (
              <span id={errorId} role="alert" className={styles.error}>
                {errorMessage}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
