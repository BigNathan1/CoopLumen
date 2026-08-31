'use client';

import { useWallet } from '@/hooks/useWallet';
import { useBalances } from '@/hooks/useBalances';
import { NetworkWarning } from './NetworkWarning';
import styles from './WalletConnect.module.css';

function formatXlm(balances: ReturnType<typeof useBalances>['data']): string | null {
  const native = balances?.find((b) => b.asset_type === 'native');
  if (!native) return null;
  return parseFloat(native.balance).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

export function WalletConnect() {
  const { publicKey, connected, connecting, error, network, expectedNetwork, networkMismatch, connect, disconnect } =
    useWallet();
  const { data: balances, isLoading: balancesLoading } = useBalances(connected ? publicKey : null);

  const shortKey = publicKey ? `${publicKey.slice(0, 6)}…${publicKey.slice(-4)}` : null;
  const xlmBalance = formatXlm(balances);

  return (
    <div className={styles.container}>
      {connected && publicKey ? (
        <div className={styles.connected}>
          <div className={styles.row}>
            <span className={styles.badge}>Connected</span>
            <span className={styles.key} title={publicKey}>
              {shortKey}
            </span>
            {network && <span className={styles.network}>{network}</span>}
            <span className={styles.balance}>
              {balancesLoading ? 'Loading XLM…' : xlmBalance !== null ? `${xlmBalance} XLM` : '—'}
            </span>
            <button className={styles.btn} onClick={disconnect}>
              Disconnect
            </button>
          </div>
          {networkMismatch && network && (
            <NetworkWarning currentNetwork={network} expectedNetwork={expectedNetwork} />
          )}
        </div>
      ) : (
        <button className={styles.btn} onClick={() => void connect()} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Freighter'}
        </button>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
