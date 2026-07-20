'use client';

import { useState } from 'react';
import { useLoanActions } from '@/hooks/useLoanActions';
import type { Loan } from '@/hooks/useLoans';
import styles from './LoanActions.module.css';

interface Props {
  loan: Loan;
}

const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

export function LoanActions({ loan }: Props) {
  const { disburse, repay, markDefaulted, cancel, pending, error } = useLoanActions(loan.id);
  const [amount, setAmount] = useState('');

  const totalDue = Number(loan.amount) * (1 + Number(loan.interest_rate ?? 0) / 100);
  const outstanding = totalDue - Number(loan.amount_repaid);
  const amountValid =
    AMOUNT_RE.test(amount) && Number(amount) > 0 && Number(amount) <= outstanding + 1e-7;

  // Terminal states have no available actions.
  if (loan.status === 'repaid' || loan.status === 'defaulted' || loan.status === 'cancelled') {
    return null;
  }

  return (
    <div className={styles.actions}>
      {loan.status === 'pending' && (
        <div className={styles.row}>
          <button className={styles.primary} onClick={() => void disburse()} disabled={pending}>
            {pending ? 'Working…' : 'Disburse'}
          </button>
          <button className={styles.ghost} onClick={() => void cancel()} disabled={pending}>
            Cancel
          </button>
        </div>
      )}

      {loan.status === 'active' && (
        <>
          <div className={styles.row}>
            <input
              className={styles.input}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Repay amount"
              aria-label="Repay amount"
            />
            <button
              className={styles.primary}
              onClick={() => {
                void repay(amount).then((loan) => loan && setAmount(''));
              }}
              disabled={pending || !amountValid}
            >
              {pending ? 'Working…' : 'Repay'}
            </button>
          </div>
          <button className={styles.danger} onClick={() => void markDefaulted()} disabled={pending}>
            Mark defaulted
          </button>
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
