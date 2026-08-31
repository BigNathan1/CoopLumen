'use client';

import { ReactNode, useRef, useEffect, useCallback } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeOnBackdrop?: boolean;
  initialFocus?: 'first' | 'last';
  ariaDescribedBy?: string;
}

/**
 * Get all focusable elements within a container.
 * Includes buttons, links, inputs, textareas, selects, and elements with tabindex >= 0.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  // A natively focusable element still matches the selector when it carries an
  // explicit tabindex="-1", so drop those: they are out of the tab order.
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.getAttribute('tabindex') !== '-1'
  );
}

/**
 * The modal's own close control takes part in the focus trap, but it is not
 * where focus should land on open — that belongs to the dialog's content.
 */
function getContentFocusableElements(container: HTMLElement): HTMLElement[] {
  return getFocusableElements(container).filter((el) => !el.hasAttribute('data-modal-close'));
}

/**
 * Modal component with backdrop, ESC key close, focus trap, and ARIA support.
 *
 * @param isOpen - Whether the modal is visible
 * @param onClose - Callback when modal should close
 * @param title - Modal title (used for aria-labelledby)
 * @param children - Modal content
 * @param closeOnBackdrop - Whether clicking backdrop closes modal (default: true)
 * @param initialFocus - Focus first or last focusable element on open (default: 'first')
 * @param ariaDescribedBy - Optional id for aria-describedby
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  closeOnBackdrop = true,
  initialFocus = 'first',
  ariaDescribedBy,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle ESC key close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Close on ESC
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap: Tab/Shift+Tab
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = getFocusableElements(modalRef.current);
        if (focusableElements.length === 0) return;

        const activeElement = document.activeElement as HTMLElement;
        const focusedIndex = focusableElements.indexOf(activeElement);

        if (e.shiftKey) {
          // Shift+Tab: move to previous
          e.preventDefault();
          const nextFocus = focusedIndex <= 0 ? focusableElements.length - 1 : focusedIndex - 1;
          focusableElements[nextFocus].focus();
        } else {
          // Tab: move to next
          e.preventDefault();
          const nextFocus = focusedIndex >= focusableElements.length - 1 ? 0 : focusedIndex + 1;
          focusableElements[nextFocus].focus();
        }
      }
    },
    [onClose]
  );

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === backdropRef.current) {
      onClose();
    }
  };

  // Focus management on mount/unmount
  useEffect(() => {
    if (!isOpen) return;

    // Save current focus
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Add keyboard listener
    document.addEventListener('keydown', handleKeyDown);

    // Move focus into modal after a tick (to ensure DOM is rendered)
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusableElements = getContentFocusableElements(modalRef.current);
        if (focusableElements.length > 0) {
          const index = initialFocus === 'last' ? focusableElements.length - 1 : 0;
          focusableElements[index].focus();
        } else {
          // Nothing focusable in the content — focus the dialog itself
          modalRef.current.focus();
        }
      }
    }, 0);

    // Cleanup
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);

      // Restore focus to previous element
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, handleKeyDown, initialFocus]);

  if (!isOpen) {
    return null;
  }

  const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;

  return (
    <>
      <div
        ref={backdropRef}
        className={styles.backdrop}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div ref={containerRef} className={styles.container}>
        <div
          ref={modalRef}
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={ariaDescribedBy}
          tabIndex={-1}
        >
          <h2 id={titleId} style={{ marginBottom: '16px', marginTop: 0 }}>
            {title}
          </h2>
          {children}
          {/* Positioned in the header by CSS, but rendered last so the tab
              order runs through the content before reaching Close. */}
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close modal"
            type="button"
            data-modal-close
          >
            ×
          </button>
        </div>
      </div>
    </>
  );
}
