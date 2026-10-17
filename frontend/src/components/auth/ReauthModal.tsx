'use client';

import { useId } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import styles from './ReauthModal.module.css';

export interface ReauthModalProps {
  /** Whether the modal dialog is visible */
  isOpen: boolean;
  /** Callback invoked when the user dismisses the modal */
  onClose: () => void;
  /** Action invoked when the user confirms re-authentication with Freighter */
  onReauthenticate: () => void | Promise<void>;
  /** True while the wallet signing or backend verification is in progress */
  isLoading?: boolean;
  /** Optional error message displayed if re-authentication failed */
  error?: string | null;
}

/**
 * Modal dialog presented when an API request returns an HTTP 401 Unauthorized,
 * prompting the user to re-sign a challenge with their Freighter wallet to
 * refresh their expired or invalid session token.
 *
 * Implements accessible dialog practices:
 * - Focus trap and escape-key dismissal inherited from {@link Modal}.
 * - ARIA labelledby and describedby associations.
 * - Loading indicators with polite screen-reader announcements.
 * - Uses semantic design-token CSS properties compatible with light and dark mode.
 */
export function ReauthModal({
  isOpen,
  onClose,
  onReauthenticate,
  isLoading = false,
  error = null,
}: ReauthModalProps) {
  const descriptionId = useId();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Session Expired"
      ariaDescribedBy={descriptionId}
      closeOnBackdrop={!isLoading}
    >
      <div data-testid="reauth-modal-content">
        <p id={descriptionId} className={styles.description}>
          Your session has expired or is no longer authorized. Please re-authenticate with your
          Freighter wallet to continue without losing your current progress.
        </p>

        {error && (
          <div className={styles.errorAlert} role="alert" data-testid="reauth-error-alert">
            {error}
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            data-testid="reauth-cancel-button"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void onReauthenticate()}
            isLoading={isLoading}
            loadingLabel="Signing challenge with Freighter"
            data-testid="reauth-confirm-button"
          >
            Re-authenticate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
