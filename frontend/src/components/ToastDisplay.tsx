'use client';

import { useToast, Toast, ToastVariant } from '@/hooks/useToast';
import { useState, useEffect } from 'react';
import styles from './ToastDisplay.module.css';

/**
 * Icons for each toast variant.
 */
const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
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
        {VARIANT_ICONS[toast.variant]}
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
