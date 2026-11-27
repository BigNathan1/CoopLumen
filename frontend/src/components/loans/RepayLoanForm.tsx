import React, { useId, useState } from 'react';
import type { Loan } from '@/hooks/useLoans';
import { Button } from '@/components/ui/Button';
import styles from './RepayLoanForm.module.css';

export interface RepayLoanFormProps {
  loan: Pick<Loan, 'id' | 'outstanding' | 'total_due' | 'amount_repaid' | 'asset_code'>;
  minRepayment?: string;
  isSubmitting?: boolean;
  onSubmit: (payload: {
    loanId: string;
    amount: string;
    isFullRepayment: boolean;
  }) => Promise<void> | void;
  onCancel?: () => void;
}

const STELLAR_PRECISION = 7;

const PRESETS = [
  { label: '25%', ratio: 0.25 },
  { label: '50%', ratio: 0.5 },
  { label: 'Full', ratio: 1 },
];

function formatStellarAmount(value: number): string {
  return value.toFixed(STELLAR_PRECISION).replace(/\.?0+$/, '');
}

export const RepayLoanForm: React.FC<RepayLoanFormProps> = ({
  loan,
  minRepayment = '0.0000001',
  isSubmitting = false,
  onSubmit,
  onCancel,
}) => {
  const [amountInput, setAmountInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const amountId = useId();
  const hintId = useId();
  const errorId = useId();

  const outstanding = Number(loan.outstanding);
  const minAmount = Number(minRepayment);
  const trimmedInput = amountInput.trim();
  const parsedAmount = Number(trimmedInput);

  const isDisabled = isSubmitting || !Number.isFinite(outstanding) || outstanding <= 0;
  const isFullRepayment =
    trimmedInput !== '' &&
    (trimmedInput === loan.outstanding.trim() ||
      (Number.isFinite(parsedAmount) && parsedAmount >= outstanding));

  const setPresetPercent = (ratio: number) => {
    if (ratio === 1) {
      // Preserve exact server-computed string to avoid floating-point drift
      setAmountInput(loan.outstanding);
    } else {
      const value = Math.min(outstanding * ratio, outstanding);
      setAmountInput(formatStellarAmount(value));
    }
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!trimmedInput || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid repayment amount.');
      return;
    }
    if (parsedAmount < minAmount) {
      setError(`Minimum repayment is ${minRepayment} ${loan.asset_code}.`);
      return;
    }
    if (parsedAmount > outstanding) {
      setError(`Amount cannot exceed remaining balance (${loan.outstanding} ${loan.asset_code}).`);
      return;
    }

    const exactFull = trimmedInput === loan.outstanding.trim() || parsedAmount === outstanding;

    try {
      await onSubmit({
        loanId: loan.id,
        amount: exactFull ? loan.outstanding : trimmedInput,
        isFullRepayment: exactFull,
      });
      setAmountInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit repayment.');
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Repay loan" className={styles.form}>
      <div>
        <label htmlFor={amountId} className={styles.label}>
          Repayment amount ({loan.asset_code})
        </label>
        <p id={hintId} className={styles.hint}>
          Remaining balance: {loan.outstanding} {loan.asset_code} (repaid {loan.amount_repaid} of{' '}
          {loan.total_due})
        </p>
      </div>

      <div role="group" aria-label="Quick repayment presets" className={styles.presets}>
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="secondary"
            size="sm"
            disabled={isDisabled}
            onClick={() => setPresetPercent(preset.ratio)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <input
        id={amountId}
        name="amount"
        type="number"
        inputMode="decimal"
        step="0.0000001"
        min={minRepayment}
        max={loan.outstanding}
        value={amountInput}
        disabled={isDisabled}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setAmountInput(e.target.value);
          if (error) setError(null);
        }}
        className={styles.input}
      />

      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="submit" disabled={isDisabled}>
          {isSubmitting
            ? 'Submitting...'
            : isFullRepayment
              ? 'Pay Full Balance'
              : 'Submit Partial Repayment'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};
