'use client';

import { ReactNode, useRef, useEffect } from 'react';
import { Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

/**
 * ConfirmDialog component for confirming destructive actions.
 *
 * Built on top of Modal for backdrop, ESC handling, and focus trap.
 * Features:
 * - role="alertdialog" for decision-requiring dialogs
 * - Safe default focus on cancel button (not destructive action)
 * - Loading state to prevent double-submit on async actions
 * - Full ARIA support with aria-labelledby and aria-describedby
 * - Confirm button styled with danger/destructive variant
 * - ESC and backdrop click close the dialog via onCancel (safe behavior)
 *
 * @param isOpen - Whether the dialog is visible
 * @param title - Dialog title (e.g. "Delete Community?")
 * @param description - Optional description/message clarifying the action
 * @param confirmLabel - Label for destructive action button (default: "Confirm")
 * @param cancelLabel - Label for safe/cancel button (default: "Cancel")
 * @param onConfirm - Callback when confirm button is clicked
 * @param onCancel - Callback when canceled (ESC, backdrop click, or cancel button)
 * @param loading - If true, disables confirm button and shows pending state
 */
export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const descriptionId = useRef(`confirm-dialog-desc-${Math.random().toString(36).slice(2)}`);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Handle Enter key on confirm button (if explicitly focused)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger confirm on Enter if the confirm button has explicit focus
      // This prevents accidental destructive actions from Enter key alone
      if (e.key === 'Enter' && document.activeElement === confirmButtonRef.current) {
        e.preventDefault();
        if (!loading) {
          handleConfirm();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading]);

  const handleConfirm = async () => {
    if (loading) return;
    await onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      ariaDescribedBy={description ? descriptionId.current : undefined}
      closeOnBackdrop={true}
      // Focus lands on the safe action (Cancel), never on the destructive one.
      initialFocus="first"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={undefined} // Modal already provides aria-labelledby, don't duplicate
        aria-describedby={description ? descriptionId.current : undefined}
      >
        {description && (
          <p id={descriptionId.current} className={styles.description}>
            {description}
          </p>
        )}

        <div className={styles.buttonGroup}>
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className={styles.cancelButton}
            disabled={loading}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirm}
            className={styles.confirmButton}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                {confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
