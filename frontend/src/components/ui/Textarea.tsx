'use client';

import {
  forwardRef,
  useId,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import styles from './Textarea.module.css';

/** Remaining characters at which the counter starts announcing itself. */
const DEFAULT_ANNOUNCE_THRESHOLD = 20;

export interface TextareaProps extends ComponentPropsWithoutRef<'textarea'> {
  /** Visible label text, tied to the control with `htmlFor`. */
  label: string;
  /** Hides the label visually while keeping it for assistive technology. */
  hideLabel?: boolean;
  /** Hint rendered under the control. */
  helperText?: ReactNode;
  /**
   * Validation message. Any non-empty string puts the field in its error state;
   * pass `true` to mark it invalid without a message of its own.
   */
  error?: string | boolean;
  /** Marks the field required, visually and through `aria-required`. */
  required?: boolean;
  /**
   * Character budget. Shows the counter and, unless `enforceMaxLength` is
   * false, caps input at this length through the native attribute.
   */
  maxLength?: number;
  /**
   * Set false to let the user type past `maxLength`. The counter then turns
   * into the error state and the field reports `aria-invalid`, which is kinder
   * than silently swallowing a paste that was a few characters too long.
   */
  enforceMaxLength?: boolean;
  /** Shows the counter without a limit, as a plain character count. */
  showCount?: boolean;
  /**
   * Remaining characters at which the counter starts being announced. Defaults
   * to 20; the count is silent above it so a reader is not interrupted on
   * every keystroke.
   */
  announceThreshold?: number;
  /** Class applied to the wrapping field element rather than the control. */
  containerClassName?: string;
}

/**
 * A labelled multi-line text control with a character count.
 *
 * The counter is the reason this exists separately from a plain textarea, and
 * getting it right is mostly an accessibility problem rather than a layout one:
 *
 * - the visible counter is `aria-hidden`, because a live count read out on
 *   every keystroke makes a field unusable with a screen reader;
 * - the limit is instead stated once, statically, in the field's description,
 *   so it is heard when the field is entered rather than discovered on
 *   overflow;
 * - a polite live region takes over only near the limit, announcing the
 *   characters remaining and then the overflow, which is when the number
 *   actually matters.
 *
 * Otherwise it carries the same wiring as the other form primitives: a label
 * associated through `htmlFor`, `aria-describedby` covering the helper text,
 * the limit and the error, `aria-invalid` and `aria-required`, and a
 * `role="alert"` validation message.
 *
 * The length is tracked for both controlled and uncontrolled use, so the count
 * is correct whether the caller owns the value or not.
 *
 * @example
 * ```tsx
 * <Textarea
 *   label="Description"
 *   helperText="Shown on the community card"
 *   maxLength={280}
 *   rows={4}
 * />
 * ```
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    hideLabel = false,
    helperText,
    error,
    required = false,
    maxLength,
    enforceMaxLength = true,
    showCount = false,
    announceThreshold = DEFAULT_ANNOUNCE_THRESHOLD,
    containerClassName,
    id,
    rows = 4,
    className,
    value,
    defaultValue,
    onChange,
    'aria-describedby': ariaDescribedBy,
    ...textareaProps
  },
  ref
) {
  const reactId = useId();
  const textareaId = id ?? `${reactId}-textarea`;
  const helperId = `${textareaId}-helper`;
  const limitId = `${textareaId}-limit`;
  const errorId = `${textareaId}-error`;

  const [uncontrolledLength, setUncontrolledLength] = useState(String(defaultValue ?? '').length);
  const length = value !== undefined ? String(value).length : uncontrolledLength;

  const counted = showCount || maxLength !== undefined;
  const over = maxLength !== undefined && length > maxLength;
  const remaining = maxLength !== undefined ? maxLength - length : undefined;

  const errorMessage = typeof error === 'string' && error.length > 0 ? error : undefined;
  const hasError = Boolean(error) || over;

  const describedBy =
    [
      ariaDescribedBy,
      helperText ? helperId : null,
      maxLength !== undefined ? limitId : null,
      errorMessage ? errorId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  // Silent until the limit is close, so the reader is not interrupted on every
  // keystroke by a number that does not matter yet.
  const announcement =
    remaining === undefined || remaining > announceThreshold
      ? ''
      : remaining >= 0
        ? `${remaining} ${remaining === 1 ? 'character' : 'characters'} remaining`
        : `${-remaining} ${remaining === -1 ? 'character' : 'characters'} over the limit`;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (value === undefined) setUncontrolledLength(event.target.value.length);
    onChange?.(event);
  };

  const labelClasses = [styles.label, hideLabel ? styles.srOnly : null].filter(Boolean).join(' ');

  return (
    <div className={[styles.field, containerClassName].filter(Boolean).join(' ')}>
      <label htmlFor={textareaId} className={labelClasses}>
        {label}
        {required && (
          <span aria-hidden="true" className={styles.requiredMark}>
            *
          </span>
        )}
      </label>

      <textarea
        {...textareaProps}
        ref={ref}
        id={textareaId}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        required={required}
        maxLength={enforceMaxLength ? maxLength : undefined}
        className={[styles.textarea, className].filter(Boolean).join(' ')}
        data-invalid={hasError || undefined}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
      />

      <div className={styles.footer}>
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

        {counted && (
          <span
            aria-hidden="true"
            className={[styles.count, over ? styles.countOver : null].filter(Boolean).join(' ')}
          >
            {maxLength === undefined ? length : `${length}/${maxLength}`}
          </span>
        )}
      </div>

      {/* Stated once, so the budget is known on entering the field. */}
      {maxLength !== undefined && (
        <span id={limitId} className={styles.srOnly}>
          {`Maximum ${maxLength} ${maxLength === 1 ? 'character' : 'characters'}`}
        </span>
      )}

      <span role="status" className={styles.srOnly}>
        {announcement}
      </span>
    </div>
  );
});
