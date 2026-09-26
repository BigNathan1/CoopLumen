'use client';

import Link from 'next/link';
import { useCommunity } from '@/hooks/useCommunities';
import { sortBalances, useTreasury } from '@/hooks/useTreasury';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { StellarAddress } from '@/components/ui/StellarAddress';
import { Table, type TableColumn } from '@/components/ui/Table';
import styles from './TreasuryOverview.module.css';

interface TreasuryOverviewProps {
  communityId: string;
}

type BalanceRow = {
  asset: string;
  native: boolean;
  issuer: string | null;
  balance: string;
};

/** Explorer links follow the network the app is configured for. */
function explorerNetwork(): 'testnet' | 'mainnet' {
  const configured = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET').toUpperCase();
  return configured === 'MAINNET' || configured === 'PUBLIC' ? 'mainnet' : 'testnet';
}

/** Same number format as the wallet balance panel: 2 to 7 decimals. */
function formatBalance(value: string): string {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}

const columns: TableColumn<BalanceRow>[] = [
  {
    key: 'asset',
    label: 'Asset',
    render: (_value, row) => (
      <div className={styles.assetCell}>
        <span className={styles.asset}>
          {row.asset}
          {row.native && (
            <Badge variant="info" size="sm">
              Native
            </Badge>
          )}
        </span>
        {row.issuer ? (
          <code className={styles.issuer} title={row.issuer}>
            <span className="sr-only">Issuer: </span>
            {`${row.issuer.slice(0, 6)}...${row.issuer.slice(-6)}`}
          </code>
        ) : (
          <span className="sr-only">No issuer, native asset</span>
        )}
      </div>
    ),
  },
  {
    key: 'balance',
    label: 'Balance',
    className: styles.numeric,
    headerClassName: styles.numericHeader,
    render: (_value, row) => <span className={styles.amount}>{formatBalance(row.balance)}</span>,
  },
];

/**
 * Body of `/communities/[id]/treasury`: the community's treasury account and
 * the live on-chain balances it holds.
 */
export function TreasuryOverview({ communityId }: TreasuryOverviewProps) {
  const { data: treasury, error, isLoading } = useTreasury(communityId);
  const { data: community } = useCommunity(communityId);

  const rows: BalanceRow[] = sortBalances(treasury?.balances ?? []).map((b) => ({
    asset: b.asset_type === 'native' ? 'XLM' : (b.asset_code ?? 'Unknown asset'),
    native: b.asset_type === 'native',
    issuer: b.asset_issuer ?? null,
    balance: b.balance,
  }));

  return (
    <main className={styles.page}>
      <Link href="/dashboard" className={styles.back}>
        Back to dashboard
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Treasury</h1>
        {community?.name && <p className={styles.subtitle}>{community.name}</p>}
      </header>

      {isLoading ? (
        <LoadingSkeleton variant="rect" height={64} count={4} gap={12} label="Loading treasury" />
      ) : error ? (
        <Alert variant="error" title="Could not load the treasury">
          {error.message || 'Something went wrong. Try again in a moment.'}
        </Alert>
      ) : treasury ? (
        <>
          <section aria-labelledby="treasury-account-heading" className={styles.section}>
            <h2 id="treasury-account-heading" className={styles.sectionTitle}>
              Treasury account
            </h2>
            <StellarAddress
              address={treasury.account}
              startLength={10}
              endLength={10}
              network={explorerNetwork()}
              className={styles.address}
            />
          </section>

          <section aria-labelledby="treasury-balances-heading" className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 id="treasury-balances-heading" className={styles.sectionTitle}>
                Balances
              </h2>
              {rows.length > 0 && (
                <p className={styles.count}>
                  {rows.length} {rows.length === 1 ? 'asset' : 'assets'}
                </p>
              )}
            </div>
            <Table<BalanceRow>
              columns={columns}
              data={rows}
              ariaLabel="Treasury balances"
              emptyMessage="This treasury account holds no assets yet."
            />
          </section>
        </>
      ) : null}
    </main>
  );
}
