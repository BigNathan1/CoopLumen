'use client';

import type { Loan } from '@/hooks/useLoans';
import { LoanActions } from './LoanActions';
import styles from './LoanCard.module.css';

interface Props {
  loan: Loan;
}

/** Shortens a Stellar address to `GABC…WXYZ` for compact display. */
function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

function formatAmount(value: string): string {
  return parseFloat(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

export function LoanCard({ loan }: Props) {
  const outstanding = Number(loan.amount) - Number(loan.amount_repaid);

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.amount}>
          {formatAmount(loan.amount)} <span className={styles.asset}>{loan.asset_code}</span>
        </span>
        <span className={`${styles.status} ${styles[loan.status]}`}>{loan.status}</span>
      </div>

      {loan.purpose && <p className={styles.purpose}>{loan.purpose}</p>}

      <div className={styles.parties}>
        <span title={loan.borrower_address}>Borrower {shortAddress(loan.borrower_address)}</span>
        <span title={loan.lender_address}>Lender {shortAddress(loan.lender_address)}</span>
      </div>

      {loan.status === 'active' && outstanding > 0 && (
        <div className={styles.outstanding}>
          Outstanding {formatAmount(outstanding.toFixed(7))} {loan.asset_code}
        </div>
      )}

      <LoanActions loan={loan} />
    </article>
  );
}
