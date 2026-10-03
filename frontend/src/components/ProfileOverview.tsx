'use client';

import { Badge, type BadgeVariant } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { LoadingSkeleton } from './ui/LoadingSkeleton';
import { NetworkBadge } from './ui/NetworkBadge';
import { StellarAddress } from './ui/StellarAddress';
import { useBalances, type Balance } from '@/hooks/useBalances';
import { useMemberships, type Membership } from '@/hooks/useMemberships';
import { useWallet } from '@/hooks/useWallet';
import styles from './ProfileOverview.module.css';

/** How a member's role is coloured. Admin stands out; the rest are neutral. */
const ROLE_VARIANT: Record<Membership['role'], BadgeVariant> = {
  admin: 'warning',
  treasurer: 'info',
  member: 'neutral',
  observer: 'neutral',
};

/** Networks the badge knows how to render. Anything else is shown as text. */
const KNOWN_NETWORKS = new Set(['TESTNET', 'MAINNET']);

/** The code an asset is shown under; the native currency has no issuer. */
function assetCodeOf(balance: Balance): string {
  return balance.asset_type === 'native' ? 'XLM' : (balance.asset_code ?? 'Unknown asset');
}

/** Formats a balance string without ever turning it into a rounded integer. */
function formatBalance(balance: string): string {
  const value = Number.parseFloat(balance);
  if (Number.isNaN(value)) return balance;
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}

/** Renders a date as a plain local date, with the raw value as a fallback. */
function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

/**
 * The connected member's own page: the wallet behind the session, what it
 * holds, and which communities it belongs to.
 *
 * The page is a thin shell around this component, so everything that has state
 * lives here and can be tested without a router.
 *
 * Accessibility notes:
 *
 * - the page is one `<h1>` followed by `<h2>` section headings, so a screen
 *   reader user can navigate it by heading rather than by link;
 * - the wallet panel is a definition list, which is the structure for
 *   name/value pairs, and the balances are a list with the asset named on each
 *   row instead of only in a column header;
 * - loading and empty states are announced rather than silently blank: a polite
 *   `role="status"` while loading, an `Alert` when a fetch fails, and a
 *   retry button in both cases;
 * - the disconnect button carries an `aria-label` naming the account, so it is
 *   never announced as a bare "Disconnect" with nothing to act on.
 *
 * @example
 * ```tsx
 * // app/profile/page.tsx
 * export default function ProfilePage() {
 *   return (
 *     <main>
 *       <ProfileOverview />
 *     </main>
 *   );
 * }
 * ```
 */
export function ProfileOverview() {
  const {
    publicKey,
    connected,
    connecting,
    network,
    expectedNetwork,
    networkMismatch,
    connect,
    disconnect,
  } = useWallet();
  const {
    data: balances,
    isLoading: balancesLoading,
    error: balancesError,
    mutate,
  } = useBalances(connected ? publicKey : null);
  const {
    data: memberships,
    isLoading: membershipsLoading,
    error: membershipsError,
    mutate: reloadMemberships,
  } = useMemberships(connected ? publicKey : null);

  if (!connected || !publicKey) {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Your profile</h1>
        <EmptyState
          title="No wallet connected"
          message="Connect your Freighter wallet to see your balances and the communities you belong to."
          action={
            <Button
              onClick={() => void connect()}
              isLoading={connecting}
              loadingLabel="Connecting to Freighter"
            >
              Connect wallet
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>Your profile</h1>
        <Button variant="secondary" size="sm" onClick={disconnect} aria-label="Disconnect wallet">
          Disconnect
        </Button>
      </header>

      <Card className={styles.card}>
        <h2 className={styles.sectionTitle}>Wallet</h2>

        {networkMismatch && (
          <p className={styles.warning} role="alert">
            This wallet is on {network ?? 'another network'}. CoopLumen expects {expectedNetwork}.
          </p>
        )}

        <dl className={styles.details}>
          <div className={styles.detail}>
            <dt className={styles.detailLabel}>Address</dt>
            <dd className={styles.detailValue}>
              <StellarAddress address={publicKey} />
            </dd>
          </div>

          {network && (
            <div className={styles.detail}>
              <dt className={styles.detailLabel}>Network</dt>
              <dd className={styles.detailValue}>
                {KNOWN_NETWORKS.has(network) ? (
                  <NetworkBadge network={network as 'TESTNET' | 'MAINNET'} />
                ) : (
                  network
                )}
              </dd>
            </div>
          )}
        </dl>

        <h3 className={styles.subsectionTitle}>Balances</h3>

        {balancesLoading && (
          <div role="status" aria-live="polite">
            <LoadingSkeleton variant="text" count={2} label="Loading balances" />
          </div>
        )}

        {!balancesLoading && balancesError && (
          <p className={styles.error} role="alert">
            Could not load your balances.{' '}
            <Button variant="ghost" size="sm" onClick={() => void mutate()}>
              Retry
            </Button>
          </p>
        )}

        {!balancesLoading && !balancesError && (balances?.length ?? 0) === 0 && (
          <p className={styles.empty} role="status">
            This account holds no assets yet.
          </p>
        )}

        {!balancesLoading && !balancesError && (balances?.length ?? 0) > 0 && (
          <ul className={styles.balanceList}>
            {balances?.map((balance) => {
              const code = assetCodeOf(balance);
              return (
                <li
                  key={`${code}:${balance.asset_issuer ?? 'native'}`}
                  className={styles.balanceItem}
                >
                  <span className={styles.balanceAsset}>{code}</span>
                  <span className={styles.balanceAmount}>{formatBalance(balance.balance)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className={styles.card}>
        <h2 className={styles.sectionTitle}>Communities</h2>

        {membershipsLoading && (
          <div role="status" aria-live="polite">
            <LoadingSkeleton variant="text" count={3} label="Loading your communities" />
          </div>
        )}

        {!membershipsLoading && membershipsError && (
          <p className={styles.error} role="alert">
            Could not load your communities.{' '}
            <Button variant="ghost" size="sm" onClick={() => void reloadMemberships()}>
              Retry
            </Button>
          </p>
        )}

        {!membershipsLoading && !membershipsError && (memberships?.length ?? 0) === 0 && (
          <EmptyState
            title="No communities yet"
            message="You do not belong to any community. Join one to start borrowing, lending and contributing."
          />
        )}

        {!membershipsLoading && !membershipsError && (memberships?.length ?? 0) > 0 && (
          <ul className={styles.membershipList}>
            {memberships?.map((membership) => (
              <li key={membership.communityId} className={styles.membershipItem}>
                <div className={styles.membershipBody}>
                  <span className={styles.membershipName}>{membership.communityName}</span>
                  <span className={styles.membershipMeta}>
                    {membership.assetCode} · joined {formatDate(membership.joinedAt)}
                  </span>
                </div>
                <Badge variant={ROLE_VARIANT[membership.role]} size="sm" srLabel="Role:">
                  {membership.role}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
