'use client';

import { useCommunities } from '@/hooks/useCommunities';
import { useWallet } from '@/hooks/useWallet';
import { WalletConnect } from './WalletConnect';
import { ThemeToggle } from './ThemeToggle';
import { CommunityCard } from './CommunityCard';
import { BalancePanel } from './BalancePanel';
import { PortfolioPanel } from '@/components/loans/PortfolioPanel';
import { MyReputationPanel } from './MyReputationPanel';
import { ReputationPanel } from './ReputationPanel';
import { LoansSection } from '@/components/loans/LoansSection';
import { CreateLoanForm } from '@/components/loans/CreateLoanForm';
import { LoadingSkeleton } from './LoadingSkeleton';
import { Button } from './ui/Button';
import styles from './Dashboard.module.css';
import { EmptyState } from './ui/EmptyState';

/** Placeholder cards shown in the grid while communities are loading. */
const SKELETON_CARD_COUNT = 6;

export function Dashboard() {
  const { data: communities, error, isLoading, mutate } = useCommunities();
  const { publicKey, connected } = useWallet();

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>◆</span>
          <h1 className={styles.title}>CoopLumen</h1>
          <span className={styles.tagline}>Decentralized Community Finance</span>
        </div>

        <div className={styles.actions}>
          <ThemeToggle />
          <WalletConnect />
        </div>
      </header>

      <div className={styles.content}>
        <aside className={styles.sidebar}>
          {connected && publicKey && <BalancePanel publicKey={publicKey} />}
          {connected && publicKey && <PortfolioPanel address={publicKey} />}
          {connected && publicKey && <MyReputationPanel address={publicKey} />}
          <ReputationPanel />
        </aside>

        <div className={styles.main}>
          <section>
            <div className={styles.sectionHeader}>
              <h2>Communities</h2>
              <span className={styles.count}>{communities?.length ?? 0} registered</span>
            </div>

            {isLoading && (
              <div className={styles.grid}>
                {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
                  <div key={index} className={styles.skeletonCard}>
                    <LoadingSkeleton
                      variant="text"
                      width="40%"
                      decorative={index !== 0}
                      label={index === 0 ? 'Loading communities' : undefined}
                    />
                    <LoadingSkeleton variant="text" count={2} lastLineWidth="60%" decorative />
                    <LoadingSkeleton variant="text" width="80%" decorative />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className={`${styles.state} ${styles.error}`} role="alert">
                <p>Could not load communities. Is the API running?</p>
                <Button variant="secondary" size="sm" onClick={() => void mutate()}>
                  Retry
                </Button>
              </div>
            )}

            {!isLoading && !error && communities?.length === 0 && (
              <EmptyState
                title="No communities yet"
                message="Create the first community to get started."
                action={
                  <a
                    href="https://github.com/yourname/cooplumen#quickstart"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Create the first one
                  </a>
                }
              />
            )}

            {!isLoading && (
              <div className={styles.grid}>
                {communities?.map((c) => (
                  <CommunityCard key={c.id} community={c} />
                ))}
              </div>
            )}
          </section>

          {connected && publicKey && communities && communities.length > 0 && (
            <CreateLoanForm lenderAddress={publicKey} communities={communities} />
          )}

          <LoansSection communities={communities} />
        </div>
      </div>
    </div>
  );
}
