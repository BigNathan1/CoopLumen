import React, { useId, useState } from 'react';

export interface RepayLoanFormProps {
  loanId: string;
  remainingBalance: number;
  currencySymbol?: string;
  minRepayment?: number;
  isSubmitting?: boolean;
  onSubmit: (payload: { loanId: string; amount: number; isFullRepayment: boolean }) => Promise<void> | void;
  onCancel?: () => void;
}

export const RepayLoanForm: React.FC<RepayLoanFormProps> = ({
  loanId,
  remainingBalance,
  currencySymbol = 'XLM',
  minRepayment = 0.01,
  isSubmitting = false,
  onSubmit,
  onCancel,
}) => {
  const [amountInput, setAmountInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const amountId = useId();
  const hintId = useId();
  const errorId = useId();

  const parsedAmount = Number(amountInput);
  const isFullRepayment = Number.isFinite(parsedAmount) && parsedAmount >= remainingBalance;

  const setPresetPercent = (ratio: number) => {
    const value = Number((remainingBalance * ratio).toFixed(2));
    setAmountInput(String(Math.min(value, remainingBalance)));
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!amountInput.trim() || !Number.isFinite(parsedAmount)) {
      setError('Enter a valid repayment amount.');
      return;
    }
    if (parsedAmount < minRepayment) {
      setError(`Minimum repayment is ${minRepayment} ${currencySymbol}.`);
      return;
    }
    if (parsedAmount > remainingBalance) {
      setError(`Amount cannot exceed remaining balance (${remainingBalance} ${currencySymbol}).`);
      return;
    }

    try {
      await onSubmit({
        loanId,
        amount: parsedAmount,
        isFullRepayment: parsedAmount === remainingBalance,
      });
      setAmountInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit repayment.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Repay loan"
      style={{
        backgroundColor: 'var(--color-surface, #ffffff)',
        color: 'var(--color-text-primary, #111827)',
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: 'var(--radius-md, 0.5rem)',
        padding: 'var(--space-4, 1rem)',
      }}
    >
      <div style={{ marginBottom: 'var(--space-3, 0.75rem)' }}>
        <label htmlFor={amountId} style={{ display: 'block', fontWeight: 600 }}>
          Repayment amount ({currencySymbol})
        </label>
        <p id={hintId} style={{ color: 'var(--color-text-secondary, #4b5563)', fontSize: '0.875rem' }}>
          Remaining balance: {remainingBalance.toFixed(2)} {currencySymbol}
        </p>

        <div
          role="group"
          aria-label="Quick repayment presets"
          style={{ display: 'flex', gap: 'var(--space-2, 0.5rem)', marginBlock: 'var(--space-2, 0.5rem)' }}
        >
          {[
            { label: '25%', ratio: 0.25 },
            { label: '50%', ratio: 0.5 },
            { label: 'Full', ratio: 1 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={isSubmitting || remainingBalance <= 0}
              onClick={() => setPresetPercent(preset.ratio)}
              style={{
                backgroundColor: 'var(--color-surface-muted, #f3f4f6)',
                color: 'var(--color-text-primary, #111827)',
                border: '1px solid var(--color-border, #d1d5db)',
                borderRadius: 'var(--radius-sm, 0.375rem)',
                padding: '0.25rem 0.75rem',
                cursor: 'pointer',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <input
          id={amountId}
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={minRepayment}
          max={remainingBalance}
          value={amountInput}
          disabled={isSubmitting || remainingBalance <= 0}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setAmountInput(e.target.value);
            if (error) setError(null);
          }}
          style={{
            width: '100%',
            backgroundColor: 'var(--color-input-bg, transparent)',
            color: 'var(--color-text-primary, inherit)',
            border: '1px solid var(--color-border, #d1d5db)',
            borderRadius: 'var(--radius-sm, 0.375rem)',
            padding: '0.5rem',
          }}
        />
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          style={{ color: 'var(--color-danger, #dc2626)', fontSize: '0.875rem', marginBottom: 'var(--space-3, 0.75rem)' }}
        >
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2, 0.5rem)' }}>
        <button
          type="submit"
          disabled={isSubmitting || remainingBalance <= 0}
          style={{
            backgroundColor: 'var(--color-primary, #2563eb)',
            color: 'var(--color-on-primary, #ffffff)',
            border: 'none',
            borderRadius: 'var(--radius-sm, 0.375rem)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
          }}
        >
          {isSubmitting
            ? 'Submitting...'
            : isFullRepayment
              ? 'Pay Full Balance'
              : 'Submit Partial Repayment'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary, #4b5563)',
              border: '1px solid var(--color-border, #d1d5db)',
              borderRadius: 'var(--radius-sm, 0.375rem)',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};