'use client';

import { useCommunities } from '@/hooks/useCommunities';
import { useWallet } from '@/hooks/useWallet';
import { WalletConnect } from './WalletConnect';
import { CommunityCard } from './CommunityCard';
import { BalancePanel } from './BalancePanel';
import { ReputationPanel } from './ReputationPanel';
import { LoansSection } from './LoansSection';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const { data: communities, error, isLoading } = useCommunities();
  const { publicKey, connected } = useWallet();

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>◆</span>
          <h1 className={styles.title}>CoopLumen</h1>
          <span className={styles.tagline}>Decentralized Community Finance</span>
        </div>
        <WalletConnect />
      </header>

      <div className={styles.content}>
        <aside className={styles.sidebar}>
          {connected && publicKey && <BalancePanel publicKey={publicKey} />}
          <ReputationPanel />
        </aside>

        <div className={styles.main}>
          <section>
            <div className={styles.sectionHeader}>
              <h2>Communities</h2>
              <span className={styles.count}>{communities?.length ?? 0} registered</span>
            </div>

            {isLoading && <div className={styles.state}>Loading communities…</div>}

            {error && (
              <div className={`${styles.state} ${styles.error}`}>
                Could not load communities. Is the API running?
              </div>
            )}

            {!isLoading && !error && communities?.length === 0 && (
              <div className={styles.state}>
                No communities yet.{' '}
                <a
                  href="https://github.com/yourname/cooplumen#quickstart"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Create the first one
                </a>
              </div>
            )}

            <div className={styles.grid}>
              {communities?.map((c) => (
                <CommunityCard key={c.id} community={c} />
              ))}
            </div>
          </section>

          <LoansSection />
        </div>
      </div>
    </div>
  );
}
