'use client';

import { useWallet } from '@/hooks/useWallet';
import styles from './WalletConnect.module.css';

export function WalletConnect() {
  const { publicKey, connected, connecting, error, connect, disconnect } =
    useWallet();

  const shortKey = publicKey
    ? `${publicKey.slice(0, 6)}…${publicKey.slice(-4)}`
    : null;

  return (
    <div className={styles.container}>
      {connected && publicKey ? (
        <div className={styles.connected}>
          <span className={styles.badge}>Connected</span>
          <span className={styles.key} title={publicKey}>
            {shortKey}
          </span>
          <button className={styles.btn} onClick={disconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <button
          className={styles.btn}
          onClick={() => void connect()}
          disabled={connecting}
        >
          {connecting ? 'Connecting…' : 'Connect Freighter'}
        </button>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
