'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCommunity } from '@/hooks/useCommunities';
import { useCommunityTransactions } from '@/hooks/useCommunityTransactions';
import { Alert } from '@/components/ui/Alert';
import { Pagination } from '@/components/ui/Pagination';
import { TransactionHistory } from '@/components/TransactionHistory';
import styles from './CommunityTransactions.module.css';

interface CommunityTransactionsProps {
  communityId: string;
}

/** Explorer links follow the network the app is configured for. */
function explorerNetwork(): 'testnet' | 'mainnet' {
  const configured = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET').toUpperCase();
  return configured === 'MAINNET' || configured === 'PUBLIC' ? 'mainnet' : 'testnet';
}

/** Reads the 1-based page from `?page=`, treating anything invalid as page 1. */
function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Body of `/communities/[id]/transactions`: the community's transaction
 * history with server-side pagination. The page lives in the URL (`?page=2`),
 * so it can be linked to and works with the browser's back and forward buttons.
 * Must be rendered inside a `Suspense` boundary because it reads the search
 * params.
 */
export function CommunityTransactions({ communityId }: CommunityTransactionsProps) {
  const page = parsePage(useSearchParams().get('page'));
  const { data, error, isLoading } = useCommunityTransactions(communityId, page);
  const { data: community } = useCommunity(communityId);

  const meta = data?.meta;
  const pageOutOfRange = Boolean(meta && meta.pages > 0 && page > meta.pages);
  const totalLabel =
    meta && meta.total > 0
      ? `${meta.total} ${meta.total === 1 ? 'transaction' : 'transactions'}`
      : null;

  return (
    <main className={styles.page}>
      <Link href="/dashboard" className={styles.back}>
        Back to dashboard
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Transactions</h1>
        {community?.name && <p className={styles.subtitle}>{community.name}</p>}
      </header>

      <section aria-label="Transaction history" className={styles.section}>
        {pageOutOfRange ? (
          <Alert variant="info" title="That page does not exist">
            This community has {meta?.pages} {meta?.pages === 1 ? 'page' : 'pages'} of transactions.{' '}
            <Link href={`/communities/${encodeURIComponent(communityId)}/transactions`}>
              Go to the first page
            </Link>
          </Alert>
        ) : (
          <TransactionHistory
            transactions={data?.items ?? []}
            isLoading={isLoading}
            error={error ? error.message || 'Something went wrong. Try again in a moment.' : null}
            network={explorerNetwork()}
            ariaLabel={community?.name ? `${community.name} transaction history` : undefined}
          />
        )}

        {!isLoading && !error && !pageOutOfRange && meta && (
          <footer className={styles.footer}>
            {totalLabel && <p className={styles.total}>{totalLabel}</p>}
            {meta.pages > 1 && <Pagination totalPages={meta.pages} />}
          </footer>
        )}
      </section>
    </main>
  );
}
