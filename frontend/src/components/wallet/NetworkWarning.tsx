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
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      <p className={styles.message}>
        Freighter is connected to <strong>{currentNetwork}</strong>, but this app expects{' '}
        <strong>{expectedNetwork}</strong>. Switch networks in Freighter to continue.
      </p>
    </div>
  );
}
