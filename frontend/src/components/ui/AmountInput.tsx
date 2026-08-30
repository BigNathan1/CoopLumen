'use client';

import { forwardRef, useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react';
import styles from './AmountInput.module.css';

/**
 * Strips a raw input string down to a valid fixed-point amount: digits and at
 * most one decimal separator, with the fractional part truncated to
 * `decimals` places.
 *
 * Deliberately permissive about intermediate states a user passes through
 * while typing (a trailing "." or a leading "." are left as-is) rather than
 * rejecting them outright — the goal is to keep the field always containing
 * *a prefix of* a valid amount, not to reject every keystroke that isn't
 * itself a complete valid number.
 */
export function sanitizeAmountInput(raw: string, decimals: number): string {
  let value = raw.replace(/[^\d.]/g, '');

  const firstDot = value.indexOf('.');
  if (firstDot !== -1) {
    // Drop any decimal separators beyond the first.
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
  }

  if (decimals <= 0) {
    value = value.split('.')[0] ?? '';
  } else if (firstDot !== -1) {
    const [whole, fraction = ''] = value.split('.');
    value = `${whole}.${fraction.slice(0, decimals)}`;
  }

  return value;
}

export interface AmountInputProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'inputMode' | 'onChange'> {
  /**
   * Fired with the sanitized change event — same contract as a plain
   * `<input onChange>`, so this drops directly into `register()` /
   * `FormField`'s render-prop the same way a native `<input>` would.
   */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /**
   * Suffix shown at the end of the field, e.g. the asset code ("XLM",
   * "USDC"). Purely presentational — never concatenated into the field's
   * value — and exposed to assistive tech via `aria-describedby` so a
   * screen reader user still hears which asset the amount is denominated
   * in, rather than only sighted users seeing it.
   */
  asset?: string;
  /**
   * Maximum digits allowed after the decimal separator. Defaults to 7,
   * matching the fixed-point precision Stellar amounts use elsewhere in
   * this app (see `amountSchema` in `frontend/src/lib/schemas.ts`).
   */
  decimals?: number;
}

/**
 * Text input for a fixed-point amount, with live decimal-precision
 * enforcement and an optional asset-code suffix.
 *
 * Renders as `type="text"` with `inputMode="decimal"` rather than
 * `type="number"`, deliberately: native number inputs apply locale-specific
 * formatting, silently round or reject values outside what the browser
 * considers "valid", and cannot express a fixed decimal-place limit — all of
 * which would fight the fixed-point string representation the rest of the
 * app expects amounts in (see `amountSchema`). Sanitization happens on the
 * change event itself, before the caller's `onChange` runs, so whatever the
 * caller reads back is already within bounds.
 *
 * Built as an uncontrolled component (no internal `value` state) so it
 * forwards `ref` cleanly to react-hook-form's `register()` and works as the
 * render-prop child of `FormField`, exactly like a plain `<input>` would:
 *
 * @example
 * ```tsx
 * <FormField name="amount" label="Amount">
 *   {(field) => <AmountInput {...field} asset="XLM" />}
 * </FormField>
 * ```
 *
 * Used standalone (outside a `<Form>`), pass `id`/`aria-label` yourself since
 * there is no `FormField` wrapper to supply them.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { asset, decimals = 7, onChange, className, style, 'aria-describedby': describedBy, ...inputProps },
  ref
) {
  const suffixId = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeAmountInput(event.target.value, decimals);
    if (sanitized !== event.target.value) {
      event.target.value = sanitized;
    }
    onChange?.(event);
  };

  const mergedDescribedBy =
    [describedBy, asset ? suffixId : undefined].filter(Boolean).join(' ') || undefined;

  // Reserve enough right padding for the suffix so typed digits never run
  // underneath it. A rough per-character estimate rather than a measured
  // width — precise enough for the short asset codes this is used with
  // ("XLM", "USDC") without adding a ResizeObserver for a cosmetic gap.
  const suffixPadding = asset ? Math.max(48, asset.length * 9 + 32) : undefined;

  return (
    <div className={styles.wrapper}>
      <input
        {...inputProps}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-describedby={mergedDescribedBy}
        onChange={handleChange}
        className={[styles.input, className].filter(Boolean).join(' ')}
        style={suffixPadding !== undefined ? { paddingRight: suffixPadding, ...style } : style}
      />
      {asset && (
        <span id={suffixId} className={styles.suffix}>
          {asset}
        </span>
      )}
    </div>
  );
});
