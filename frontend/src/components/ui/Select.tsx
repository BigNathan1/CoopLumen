'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import styles from './Select.module.css';

/** How long a typeahead buffer stays open before the next key starts over. */
const TYPEAHEAD_RESET_MS = 500;

export interface SelectOption {
  /** Value reported to `onChange` and submitted with the form. */
  value: string;
  /** Text shown in the list and in the trigger once selected. */
  label: string;
  /** Skipped by pointer, keyboard and typeahead. */
  disabled?: boolean;
}

export interface SelectProps {
  /** Visible label text, associated with the trigger through `aria-labelledby`. */
  label: string;
  /** The choices, in the order they should be presented. */
  options: SelectOption[];
  /** Controlled selection. Pass together with `onChange`. */
  value?: string;
  /** Initial selection when the component owns its own state. */
  defaultValue?: string;
  /** Called with the newly selected value. */
  onChange?: (value: string) => void;
  /** Shown in the trigger while nothing is selected. */
  placeholder?: string;
  /** Hint rendered under the control. */
  helperText?: ReactNode;
  /**
   * Validation message. Any non-empty string puts the field in its error state;
   * pass `true` to mark it invalid without a message of its own.
   */
  error?: string | boolean;
  /** Marks the field required, visually and through `aria-required`. */
  required?: boolean;
  /** Prevents opening the list and changing the selection. */
  disabled?: boolean;
  /** Hides the label visually while keeping it for assistive technology. */
  hideLabel?: boolean;
  /** Submitted with the surrounding form through a hidden input. */
  name?: string;
  /** Id of the trigger. Generated when omitted. */
  id?: string;
  /** Class applied to the wrapping field element. */
  className?: string;
}

/** First selectable option at or after `from`, walking in the `step` direction. */
function findEnabled(options: SelectOption[], from: number, step: number): number {
  for (let i = from; i >= 0 && i < options.length; i += step) {
    if (!options[i].disabled) return i;
  }
  return -1;
}

/**
 * A single-select dropdown built on the ARIA collapsible listbox pattern.
 *
 * A native `<select>` cannot be styled to match the rest of the design system
 * on every platform, so this renders its own trigger and list. That trade is
 * only worth making if the keyboard and screen-reader behaviour a native select
 * gives away for free is reproduced, so the component implements the full
 * pattern:
 *
 * - the trigger is a `combobox` with `aria-haspopup="listbox"`, `aria-expanded`
 *   and `aria-controls`, labelled by the visible label plus its own text;
 * - focus stays on the trigger throughout and the active option is tracked with
 *   `aria-activedescendant`, so the tab order is never disturbed and closing the
 *   list cannot strand focus on a removed element;
 * - Enter, Space, Arrow Down and Arrow Up open the list; the arrows, Home and
 *   End move the active option; Enter and Space commit it; Escape closes
 *   without changing the selection; Tab closes and moves on;
 * - typing jumps to the option starting with what was typed, matching how a
 *   native select behaves, both when open and when closed;
 * - each option carries `role="option"` and `aria-selected`, and disabled
 *   options are skipped by every one of those paths rather than merely dimmed.
 *
 * A hidden input mirrors the value so the control still submits inside a plain
 * form.
 *
 * @example
 * ```tsx
 * <Select
 *   label="Member role"
 *   options={[
 *     { value: 'member', label: 'Member' },
 *     { value: 'admin', label: 'Admin' },
 *   ]}
 *   value={role}
 *   onChange={setRole}
 * />
 * ```
 */
export function Select({
  label,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = 'Select an option',
  helperText,
  error,
  required = false,
  disabled = false,
  hideLabel = false,
  name,
  id,
  className,
}: SelectProps) {
  const reactId = useId();
  const triggerId = id ?? `${reactId}-trigger`;
  const labelId = `${triggerId}-label`;
  const listId = `${triggerId}-listbox`;
  const helperId = `${triggerId}-helper`;
  const errorId = `${triggerId}-error`;

  const optionId = useCallback((index: number) => `${triggerId}-option-${index}`, [triggerId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ query: '', at: 0 });

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');

  const selectedValue = value ?? uncontrolledValue;
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === selectedValue),
    [options, selectedValue]
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const errorMessage = typeof error === 'string' && error.length > 0 ? error : undefined;
  const hasError = Boolean(error);

  const describedBy =
    [helperText ? helperId : null, errorMessage ? errorId : null].filter(Boolean).join(' ') ||
    undefined;

  const closeList = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    const start =
      selectedIndex >= 0 && !options[selectedIndex].disabled
        ? selectedIndex
        : findEnabled(options, 0, 1);
    setActiveIndex(start);
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      if (value === undefined) setUncontrolledValue(option.value);
      onChange?.(option.value);
      closeList();
    },
    [closeList, onChange, options, value]
  );

  // A pointer press anywhere else dismisses the list. Focus never left the
  // trigger, so there is nothing to restore.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closeList();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open, closeList]);

  // Keep the active option in view when the arrows walk past the visible edge.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const active = listRef.current?.children.item(activeIndex);
    (active as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeIndex]);

  const moveActive = (step: number) => {
    const from = activeIndex < 0 ? (step > 0 ? 0 : options.length - 1) : activeIndex + step;
    const next = findEnabled(options, from, step);
    if (next >= 0) setActiveIndex(next);
  };

  const jumpToTyped = (char: string) => {
    const now = Date.now();
    const query =
      now - typeahead.current.at > TYPEAHEAD_RESET_MS ? char : typeahead.current.query + char;
    typeahead.current = { query, at: now };

    const from = activeIndex >= 0 ? activeIndex : selectedIndex;
    const order = options.map((_, i) => (from + 1 + i + options.length) % options.length);
    const match = order.find(
      (i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(query.toLowerCase())
    );

    if (match === undefined) return;
    if (open) setActiveIndex(match);
    else commit(match);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (open) moveActive(1);
        else openList();
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (open) moveActive(-1);
        else openList();
        return;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        setActiveIndex(findEnabled(options, 0, 1));
        return;
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActiveIndex(findEnabled(options, options.length - 1, -1));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) commit(activeIndex);
        else openList();
        return;
      case 'Escape':
        if (!open) return;
        event.preventDefault();
        closeList();
        return;
      case 'Tab':
        // Let focus move on, but do not leave an orphaned list behind.
        if (open) closeList();
        return;
      default:
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          jumpToTyped(event.key);
        }
    }
  };

  return (
    <div ref={containerRef} className={[styles.field, className].filter(Boolean).join(' ')}>
      {/*
       * A <span> rather than a <label>: the trigger is a button, which a label
       * does not associate with, so the connection is made with
       * aria-labelledby. The click handler restores the click-to-focus
       * behaviour a real label would have given.
       */}
      <span
        id={labelId}
        className={[styles.label, hideLabel ? styles.srOnly : null].filter(Boolean).join(' ')}
        onClick={() => triggerRef.current?.focus()}
      >
        {label}
        {required && (
          <span aria-hidden="true" className={styles.requiredMark}>
            *
          </span>
        )}
      </span>

      <div className={styles.control}>
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          role="combobox"
          className={styles.trigger}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${labelId} ${triggerId}`}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={hasError || undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          data-invalid={hasError || undefined}
          data-placeholder={selectedOption ? undefined : true}
          onClick={() => (open ? closeList() : openList())}
          onKeyDown={handleKeyDown}
        >
          <span className={styles.value}>{selectedOption?.label ?? placeholder}</span>
          <span aria-hidden="true" className={styles.chevron} />
        </button>

        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className={styles.list}
          hidden={!open}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              className={styles.option}
              aria-selected={option.value === selectedValue}
              aria-disabled={option.disabled || undefined}
              data-active={index === activeIndex || undefined}
              // The trigger keeps focus, so the press must not move it away.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => !option.disabled && setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>

      {name && <input type="hidden" name={name} value={selectedValue} />}

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
}
