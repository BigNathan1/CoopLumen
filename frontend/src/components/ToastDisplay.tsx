'use client';

import { useToast, Toast, ToastVariant } from '@/hooks/useToast';
import { useState, useEffect, type ReactNode } from 'react';
import styles from './ToastDisplay.module.css';

/** Stroke icon per toast variant, drawn rather than typed so it renders the same everywhere. */
const VARIANT_ICONS: Record<ToastVariant, ReactNode> = {
  success: <path d="m5 12 4 4L19 6" />,
  error: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.3 2.2 17a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
};

/**
 * ARIA live region roles for each variant.
 * Error/warning use role="alert" (assertive priority).
 * Success/info use role="status" (polite priority).
 */
const VARIANT_ROLES: Record<ToastVariant, 'alert' | 'status'> = {
  error: 'alert',
  warning: 'alert',
  success: 'status',
  info: 'status',
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

/**
 * Individual toast item with auto-dismiss, close button, and ARIA live region.
 */
function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    // Wait for animation to finish before dismissing
    setTimeout(() => {
      onDismiss(toast.id);
    }, 300);
  };

  const role = VARIANT_ROLES[toast.variant];

  return (
    <div
      className={`${styles.toast} ${styles[toast.variant]} ${isExiting ? styles.exiting : ''}`}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className={styles.icon} aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          {VARIANT_ICONS[toast.variant]}
        </svg>
      </div>
      <div className={styles.content}>
        <div className={styles.message}>{toast.message}</div>
      </div>
      {toast.dismissible && (
        <button
          className={styles.closeButton}
          onClick={handleClose}
          aria-label="Dismiss notification"
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * Toast display container that renders all active toasts.
 * This component should be placed once at the root of the app,
 * typically in the layout just before children.
 */
export function ToastDisplay() {
  const { toasts, dismiss } = useToast();

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}
