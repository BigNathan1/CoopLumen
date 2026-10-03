'use client';

import type { Token } from '@/hooks/useTokens';
import styles from './TokenCard.module.css';

interface Props {
  token: Token;
}

/** Shortens a Stellar address to `GABC…WXYZ` for compact display. */
function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

function formatSupply(value: string, decimals: number | null): string {
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return value;
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals ?? 7,
  });
}

export function TokenCard({ token }: Props) {
  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.code}>{token.asset_code}</span>
        {token.name && <span className={styles.name}>{token.name}</span>}
      </div>

      {token.description && <p className={styles.description}>{token.description}</p>}

      <div className={styles.supply}>
        <span className={styles.supplyValue}>
          {formatSupply(token.total_supply, token.decimals)}
        </span>
        <span className={styles.supplyLabel}>total supply</span>
      </div>

      <dl className={styles.meta}>
        <div className={styles.metaRow}>
          <dt>Issuer</dt>
          <dd title={token.asset_issuer}>{shortAddress(token.asset_issuer)}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Distributor</dt>
          <dd title={token.distributor_address}>{shortAddress(token.distributor_address)}</dd>
        </div>
      </dl>
    </article>
  );
}
