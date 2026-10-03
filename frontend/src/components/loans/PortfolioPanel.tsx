'use client';

import { usePortfolio, type AssetPosition } from '@/hooks/usePortfolio';
import styles from './PortfolioPanel.module.css';

interface Props {
  address: string;
}

function fmt(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

/** A proportional bar splitting a position into owed-to-you vs you-owe shares. */
function BalanceBar({ position }: { position: AssetPosition }) {
  const total = position.owedToYou + position.youOwe;
  if (total <= 0) return null;
  const owedPct = (position.owedToYou / total) * 100;
  return (
    <div className={styles.bar} role="presentation">
      <span className={styles.barOwed} style={{ width: `${owedPct}%` }} />
      <span className={styles.barOwe} style={{ width: `${100 - owedPct}%` }} />
    </div>
  );
}

/**
 * Sidebar panel summarizing the connected member's lending and borrowing:
 * active-loan counts per role, and per-asset net positions (owed to you minus
 * you owe) with a visual balance bar. Positions never mix assets.
 */
export function PortfolioPanel({ address }: Props) {
  const { portfolio, isLoading, error } = usePortfolio(address);

  if (isLoading) {
    return <div className={styles.state}>Loading your portfolio…</div>;
  }

  if (error) {
    return <div className={styles.state}>Could not load your portfolio.</div>;
  }

  if (portfolio.isEmpty) {
    return (
      <div className={styles.state}>No loans yet — lend or borrow to start your portfolio.</div>
    );
  }

  const { lending, borrowing, positions } = portfolio;

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Your Portfolio</h3>

      <div className={styles.roles}>
        <div className={styles.role}>
          <span className={styles.roleValue}>{lending.active}</span>
          <span className={styles.roleLabel}>lending</span>
          <span className={styles.roleSub}>{lending.total} total</span>
        </div>
        <div className={styles.role}>
          <span className={styles.roleValue}>{borrowing.active}</span>
          <span className={styles.roleLabel}>borrowing</span>
          <span className={styles.roleSub}>{borrowing.total} total</span>
        </div>
      </div>

      {positions.length === 0 ? (
        <p className={styles.state}>No active balances — every loan is settled.</p>
      ) : (
        <ul className={styles.positions}>
          {positions.map((p) => (
            <li key={p.asset_code} className={styles.position}>
              <div className={styles.positionHead}>
                <span className={styles.asset}>{p.asset_code}</span>
                <span
                  className={`${styles.net} ${p.net >= 0 ? styles.positive : styles.negative}`}
                  title="Net position: owed to you minus what you owe"
                >
                  {p.net >= 0 ? '+' : '−'}
                  {fmt(Math.abs(p.net))}
                </span>
              </div>
              <BalanceBar position={p} />
              <div className={styles.flows}>
                <span className={styles.owed} title="Outstanding owed to you as lender">
                  +{fmt(p.owedToYou)} in
                </span>
                <span className={styles.owe} title="Outstanding you owe as borrower">
                  −{fmt(p.youOwe)} out
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
