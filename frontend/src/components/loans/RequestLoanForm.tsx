'use client';

import { useState } from 'react';
import { useCreateLoan } from '@/hooks/useCreateLoan';
import { useWallet } from '@/hooks/useWallet';
import type { Community } from '@/hooks/useCommunities';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import styles from './RequestLoanForm.module.css';

const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

export interface RequestLoanFormProps {
  communities: Community[];
}

export function RequestLoanForm({ communities }: RequestLoanFormProps) {
  const { publicKey: borrowerAddress, connected } = useWallet();
  const { createLoan, submitting, error } = useCreateLoan();
  const [communityId, setCommunityId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [success, setSuccess] = useState(false);

  const selected = communities.find((c) => c.id === communityId);

  const validationError = (): string | null => {
    if (!connected || !borrowerAddress) return 'Connect your wallet to request a loan';
    if (!communityId) return 'Select a community';
    if (!AMOUNT_RE.test(amount) || Number(amount) <= 0) return 'Enter a positive amount';
    if (dueAt) {
      const dueDate = Date.parse(dueAt);
      if (isNaN(dueDate)) return 'Enter a valid due date';
      if (dueDate < Date.now()) return 'Due date must be in the future';
    }
    return null;
  };

  const clientError = validationError();

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSuccess(false);
    if (clientError || !selected || !borrowerAddress) return;

    const loan = await createLoan({
      communityId,
      borrowerAddress,
      lenderAddress: borrowerAddress,
      amount,
      assetCode: selected.asset_code,
      assetIssuer: selected.asset_issuer,
      purpose: purpose.trim() || undefined,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      interestRate: 0,
    });

    if (loan) {
      setSuccess(true);
      setCommunityId('');
      setAmount('');
      setDueAt('');
      setPurpose('');
    }
  };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      <h3 className={styles.title}>Request a Loan</h3>
      <p className={styles.hint}>
        You are borrowing as{' '}
        {borrowerAddress
          ? `${borrowerAddress.slice(0, 6)}…${borrowerAddress.slice(-4)}`
          : 'unknown'}
      </p>

      <Select
        label="Community"
        options={communities.map((c) => ({
          value: c.id,
          label: `${c.name} (${c.asset_code})`,
        }))}
        value={communityId}
        onChange={setCommunityId}
        placeholder="Select a community…"
        required
        error={!communityId && clientError === 'Select a community'}
      />

      <Input
        label="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder="0.00"
        helperText={selected ? `Asset: ${selected.asset_code}` : undefined}
        required
        error={amount && (!AMOUNT_RE.test(amount) || Number(amount) <= 0)}
      />

      <Input
        label="Due date (optional)"
        type="date"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        min={minDate}
        helperText="When the loan should be repaid by"
        error={dueAt && isNaN(Date.parse(dueAt))}
      />

      <Textarea
        label="Description (optional)"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        maxLength={280}
        rows={3}
        placeholder="What is this loan for?"
        helperText="Maximum 280 characters"
      />

      {error && <p className={styles.error}>{error}</p>}
      {!connected && !borrowerAddress && (
        <p className={styles.error}>Connect your wallet to request a loan</p>
      )}
      {success && <p className={styles.success}>Loan requested and awaiting a lender.</p>}

      <Button
        className={styles.btn}
        type="submit"
        fullWidth
        isLoading={submitting}
        disabled={clientError !== null || !connected || !borrowerAddress}
      >
        {submitting ? 'Requesting…' : 'Request loan'}
      </Button>
      {clientError && connected && borrowerAddress && <p className={styles.hint}>{clientError}</p>}
    </form>
  );
}
