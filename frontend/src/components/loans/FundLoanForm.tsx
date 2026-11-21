'use client';

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useLoanActions } from '@/hooks/useLoanActions';
import type { Loan } from '@/hooks/useLoans';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import styles from './FundLoanForm.module.css';

interface Props {
  loan: Loan;
}

export function FundLoanForm({ loan }: Props) {
  const { publicKey: lenderAddress, connected } = useWallet();
  const { disburse, pending, error } = useLoanActions(loan.id);
  const [stellarTxHash, setStellarTxHash] = useState('');
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState(false);

  const isLender = connected && lenderAddress === loan.lender_address;
  const canFund = loan.status === 'pending' && isLender;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSuccess(false);

    const result = await disburse({ stellarTxHash: stellarTxHash.trim() || undefined, note: note.trim() || undefined });

    if (result) {
      setSuccess(true);
      setStellarTxHash('');
      setNote('');
    }
  };

  if (!canFund) {
    if (!connected) {
      return (
        <div className={styles.container}>
          <p className={styles.error}>Connect your wallet to fund this loan</p>
        </div>
      );
    }
    if (!isLender) {
      return (
        <div className={styles.container}>
          <p className={styles.error}>Only the lender can fund this loan</p>
        </div>
      );
    }
    if (loan.status !== 'pending') {
      return (
        <div className={styles.container}>
          <p className={styles.error}>This loan cannot be funded (status: {loan.status})</p>
        </div>
      );
    }
    return null;
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      <h3 className={styles.title}>Fund Loan</h3>
      <p className={styles.hint}>
        You are lending as {lenderAddress ? `${lenderAddress.slice(0, 6)}…${lenderAddress.slice(-4)}` : 'unknown'}
      </p>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Loan amount</span>
          <span className={styles.summaryValue}>
            {Number(loan.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })}
            <span className={styles.asset}>{loan.asset_code}</span>
          </span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Borrower</span>
          <span className={styles.summaryValue} title={loan.borrower_address}>
            {loan.borrower_address.slice(0, 6)}…{loan.borrower_address.slice(-4)}
          </span>
        </div>
      </div>

      <Input
        label="Stellar transaction hash (optional)"
        value={stellarTxHash}
        onChange={(e) => setStellarTxHash(e.target.value)}
        placeholder="TX hash from Stellar network"
        helperText="Paste the transaction hash after sending funds"
      />

      <Input
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={280}
        placeholder="Any additional details"
        helperText="Maximum 280 characters"
      />

      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>Loan funded and now active.</p>}

      <Button
        className={styles.btn}
        type="submit"
        fullWidth
        isLoading={pending}
        disabled={pending}
      >
        {pending ? 'Funding…' : 'Fund loan'}
      </Button>
    </form>
  );
}