'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import styles from './Tooltip.module.css';

/** Where the tooltip appears relative to its trigger. */
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Text or markup announced as the tooltip and read by assistive technology. */
  content: ReactNode;
  /** Visual placement relative to the trigger. Defaults to `top`. */
  placement?: TooltipPlacement;
  /** Element that triggers the tooltip on hover and focus. */
  children: ReactNode;
  /** Override the generated tooltip id (useful when testing or linking externally). */
  id?: string;
  /** Delay before showing the tooltip, in milliseconds. Defaults to `0` for tests. */
  delayDuration?: number;
  /** Class applied to the outer wrapper rather than the tooltip bubble. */
  className?: string;
  /** Class applied directly to the tooltip bubble. */
  contentClassName?: string;
}

type TriggerProps = HTMLAttributes<HTMLElement> & {
  'aria-describedby'?: string;
};

/**
 * Contextual help text shown on hover and focus.
 *
 * The trigger keeps its place in the tab order and the tooltip is linked with
 * `aria-describedby` so screen readers announce it as the description of the
 * trigger. Hover, focus and keyboard (Escape) are all handled, and the bubble
 * is styled entirely from `globals.css` tokens so a theme change moves it
 * without one-off colours.
 *
 * Accessibility notes:
 *
 * - The tooltip has `role="tooltip"` and a stable id. The trigger receives
 *   `aria-describedby` only while the tooltip is visible, so the description
 *   is not announced when nothing is shown.
 * - Focus never moves to the tooltip itself, so the tab order is preserved and
 *   closing never strands focus on a removed element.
 * - Escape dismisses the tooltip without moving focus away from the trigger.
 * - `delayDuration` is honoured on hover to avoid flashing during mouse travel,
 *   but focus shows immediately so keyboard users are not kept waiting.
 *
 * @example
 * ```tsx
 * <Tooltip content="Members can invite others once trusted">
 *   <button type="button" aria-label="More info">?</button>
 * </Tooltip>
 * ```
 */
export function Tooltip({
  content,
  placement = 'top',
  children,
  id,
  delayDuration = 0,
  className,
  contentClassName,
}: TooltipProps) {
  const reactId = useId();
  const tooltipId = id ?? `${reactId}-tooltip`;
  const [open, setOpen] = useState(false);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    setOpen(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (delayDuration > 0) {
      delayRef.current = setTimeout(show, delayDuration);
    } else {
      show();
    }
  }, [delayDuration, show]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        hide();
      }
    },
    [hide]
  );

  // Build the trigger: clone a single element to keep its tab order and
  // semantics, otherwise wrap the content in a focusable span.
  let trigger: ReactNode;

  if (isValidElement(children)) {
    const element = children as ReactElement<TriggerProps>;
    const existingDescribedBy = element.props['aria-describedby'];
    const describedBy = open
      ? [existingDescribedBy, tooltipId].filter(Boolean).join(' ')
      : existingDescribedBy;

    const originalOnFocus = element.props.onFocus;
    const originalOnBlur = element.props.onBlur;
    const originalOnMouseEnter = element.props.onMouseEnter;
    const originalOnMouseLeave = element.props.onMouseLeave;
    const originalOnKeyDown = element.props.onKeyDown;

    trigger = cloneElement(element, {
      'aria-describedby': describedBy,
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        show();
        originalOnFocus?.(e as never);
      },
      onBlur: (e: React.FocusEvent<HTMLElement>) => {
        hide();
        originalOnBlur?.(e as never);
      },
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        handleMouseEnter();
        originalOnMouseEnter?.(e as never);
      },
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
        hide();
        originalOnMouseLeave?.(e as never);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        handleKeyDown(e as never);
        // Call original after, so Escape still propagates to caller's handler
        // if they listen for it.
        (originalOnKeyDown as unknown as (e: React.KeyboardEvent<HTMLElement>) => void)?.(e);
      },
    } as TriggerProps);
  } else {
    trigger = (
      <span
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={show}
        onBlur={hide}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={hide}
        onKeyDown={handleKeyDown}
        className={styles.fallbackTrigger}
      >
        {children}
      </span>
    );
  }

  // When content is falsy (empty string, null) render only the trigger so a
  // tooltip is never announced with no text.
  const hasContent = content !== null && content !== undefined && content !== '';

  return (
    <span
      className={[styles.wrapper, className].filter(Boolean).join(' ') || undefined}
      // Wrapper-level handlers catch hover/focus when the trigger is a
      // non-element (fallback span) or to cover the gap between trigger and
      // bubble, but cloned triggers already have their own handlers so this is
      // harmless when they overlap.
      onMouseLeave={hide}
    >
      {trigger}
      {open && hasContent && (
        <span
          id={tooltipId}
          role="tooltip"
          data-placement={placement}
          className={[styles.tooltip, contentClassName].filter(Boolean).join(' ')}
        >
          {content}
        </span>
      )}
    </span>
  );
}
