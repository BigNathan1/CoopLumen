'use client';

import styles from './NetworkWarning.module.css';

interface Props {
  /** The network Freighter currently reports (e.g. "PUBLIC", "TESTNET"). */
  currentNetwork: string;
  /** The network CoopLumen expects the wallet to be on. */
  expectedNetwork: string;
}

/**
 * Alerts the user when their connected Freighter wallet is on a different
 * Stellar network than the one this deployment targets. Signing a transaction
 * in this state fails on submission, so the warning surfaces the mismatch
 * before that happens.
 */
export function NetworkWarning({ currentNetwork, expectedNetwork }: Props) {
  return (
    <div className={styles.banner} role="alert">
      <span className={styles.icon}>
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M10.3 3.3 2.2 17a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </span>
      <p className={styles.message}>
        Freighter is connected to <strong>{currentNetwork}</strong>, but this app expects{' '}
        <strong>{expectedNetwork}</strong>. Switch networks in Freighter to continue.
      </p>
    </div>
  );
}
