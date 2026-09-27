'use client';

import { useAccountDetails } from '@/hooks/useAccountDetails';
import styles from './TreasuryPanel.module.css';

interface Props {
  /** Stellar public key of the community's treasury (issuer) account. */
  publicKey: string;
}

function shortenKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-6)}` : key;
}

/**
 * Shows a treasury Stellar account's on-chain balances and signers, so
 * members can verify how the treasury is funded and who controls it.
 */
export function TreasuryPanel({ publicKey }: Props) {
  const { data: account, error, isLoading, isValidating, mutate } = useAccountDetails(publicKey);

  const handleRefresh = () => {
    void mutate();
  };

  const refreshButton = (
    <button
      type="button"
      className={styles.refreshButton}
      onClick={handleRefresh}
      disabled={isValidating}
      aria-label={isValidating ? 'Refreshing treasury…' : 'Refresh treasury'}
    >
      <span
        className={`${styles.refreshIcon} ${isValidating ? styles.spinning : ''}`}
        aria-hidden="true"
      >
        ⟳
      </span>
    </button>
  );

  if (isLoading) {
    return (
      <div className={styles.state} role="status" aria-live="polite">
        Loading treasury…
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={`${styles.state} ${styles.error}`} role="alert">
            Failed to load treasury
          </div>
          {refreshButton}
        </div>
      </div>
    );
  }

  const balances = account?.balances ?? [];
  const signers = account?.signers ?? [];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Treasury</h3>
        {refreshButton}
      </div>

      <p className={styles.account} title={publicKey}>
        {shortenKey(publicKey)}
      </p>

      <section aria-labelledby="treasury-balances-heading">
        <h4 id="treasury-balances-heading" className={styles.subtitle}>
          Balances
        </h4>
        {balances.length === 0 ? (
          <p className={styles.state}>No balances found</p>
        ) : (
          <ul className={styles.list}>
            {balances.map((b) => {
              const asset = b.asset_type === 'native' ? 'XLM' : (b.asset_code ?? 'Unknown asset');
              return (
                <li key={`${asset}:${b.asset_issuer ?? 'native'}`} className={styles.item}>
                  <span className={styles.asset}>{asset}</span>
                  <span className={styles.amount}>
                    {parseFloat(b.balance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 7,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="treasury-signers-heading">
        <h4 id="treasury-signers-heading" className={styles.subtitle}>
          Signers
        </h4>
        {signers.length === 0 ? (
          <p className={styles.state}>No signers found</p>
        ) : (
          <ul className={styles.list}>
            {signers.map((signer) => (
              <li key={signer.key} className={styles.item}>
                <span className={styles.signerKey} title={signer.key}>
                  {shortenKey(signer.key)}
                </span>
                <span className={styles.weight}>weight {signer.weight}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
