'use client';

import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import styles from './Input.module.css';

export interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'size'> {
  /** Visible label text, tied to the control with `htmlFor`. */
  label: string;
  /**
   * Hides the label visually while keeping it for assistive technology. Use it
   * only where the surrounding context already names the field, such as a
   * search box next to a heading that says what is being searched.
   */
  hideLabel?: boolean;
  /** Hint rendered under the control, e.g. an expected format. */
  helperText?: ReactNode;
  /**
   * Validation message. Any non-empty string puts the field in its error state;
   * pass `true` to style the field as invalid without a message of its own,
   * for the case where the message lives elsewhere on the page.
   */
  error?: string | boolean;
  /** Marks the field required, visually and through `aria-required`. */
  required?: boolean;
  /** Decorative element rendered inside the control, before the text. */
  leadingIcon?: ReactNode;
  /** Decorative element rendered inside the control, after the text. */
  trailingIcon?: ReactNode;
  /** Class applied to the wrapping field element rather than the control. */
  containerClassName?: string;
}

/**
 * A labelled text input with helper text and an error state.
 *
 * The label, the hint and the validation message are part of the component
 * rather than left to each caller, because that wiring is exactly what tends to
 * be dropped: a placeholder used as a label, a red border with nothing
 * announced, a hint no reader ever hears.
 *
 * Accessibility notes:
 *
 * - The label is always rendered and always associated through `htmlFor`, so
 *   clicking it focuses the control. `hideLabel` hides it visually only.
 * - `aria-describedby` points at the helper text, the error, or both, so the
 *   reader hears them as part of the field rather than as loose text. Helper
 *   text is kept while an error shows, because a format hint stays useful
 *   exactly when the value is wrong.
 * - `aria-invalid` is set while the field has an error, and the message is a
 *   `role="alert"` so it is announced when it appears.
 * - `aria-required` is set alongside the native `required` attribute, since the
 *   app's forms render with `noValidate` and do not rely on native validation.
 * - Icons are decorative and `aria-hidden`; they never contribute to the name.
 *
 * @example
 * ```tsx
 * <Input
 *   label="Asset code"
 *   helperText="1-12 characters, letters and digits only"
 *   error={errors.assetCode}
 *   required
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hideLabel = false,
    helperText,
    error,
    required = false,
    leadingIcon,
    trailingIcon,
    containerClassName,
    id,
    type = 'text',
    className,
    'aria-describedby': ariaDescribedBy,
    ...inputProps
  },
  ref
) {
  const reactId = useId();
  const inputId = id ?? `${reactId}-input`;
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
      <label htmlFor={inputId} className={labelClasses}>
        {label}
        {required && (
          <span aria-hidden="true" className={styles.requiredMark}>
            *
          </span>
        )}
      </label>

      <div className={styles.control} data-invalid={hasError || undefined}>
        {leadingIcon && (
          <span aria-hidden="true" className={styles.leadingIcon}>
            {leadingIcon}
          </span>
        )}

        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          type={type}
          required={required}
          className={[styles.input, className].filter(Boolean).join(' ')}
          aria-invalid={hasError || undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
        />

        {trailingIcon && (
          <span aria-hidden="true" className={styles.trailingIcon}>
            {trailingIcon}
          </span>
        )}
      </div>

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
  );
});
