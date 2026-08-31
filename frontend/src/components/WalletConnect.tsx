'use client';

import { useWallet } from '@/hooks/useWallet';
import { Button } from './ui/Button';
import styles from './WalletConnect.module.css';

export function WalletConnect() {
  const { publicKey, connected, connecting, error, connect, disconnect } = useWallet();

  const shortKey = publicKey ? `${publicKey.slice(0, 6)}…${publicKey.slice(-4)}` : null;

  return (
    <div className={styles.container}>
      {connected && publicKey ? (
        <div className={styles.connected}>
          <span className={styles.badge}>Connected</span>
          <span className={styles.key} title={publicKey}>
            {shortKey}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={disconnect}
            aria-label={`Disconnect wallet ${publicKey}`}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={() => void connect()}
          isLoading={connecting}
          loadingLabel="Connecting to Freighter"
        >
          Connect Freighter
        </Button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
