'use client';

import { useState } from 'react';
import { useCreateLoan } from '@/hooks/useCreateLoan';
import type { Community } from '@/hooks/useCommunities';
import styles from './CreateLoanForm.module.css';

interface Props {
  /** Connected wallet address; used as the lender funding the loan. */
  lenderAddress: string;
  communities: Community[];
}

const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;
const STELLAR_RE = /^G[A-Z2-7]{55}$/;

export function CreateLoanForm({ lenderAddress, communities }: Props) {
  const { createLoan, submitting, error } = useCreateLoan();
  const [communityId, setCommunityId] = useState('');
  const [borrower, setBorrower] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [success, setSuccess] = useState(false);

  const selected = communities.find((c) => c.id === communityId);

  const validationError = (): string | null => {
    if (!communityId) return 'Select a community';
    if (!STELLAR_RE.test(borrower)) return 'Borrower must be a valid Stellar address';
    if (borrower === lenderAddress) return 'Borrower and lender cannot be the same account';
    if (!AMOUNT_RE.test(amount) || Number(amount) <= 0) return 'Enter a positive amount';
    return null;
  };

  const clientError = validationError();

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSuccess(false);
    if (clientError || !selected) return;

    const loan = await createLoan({
      communityId,
      borrowerAddress: borrower,
      lenderAddress,
      amount,
      assetCode: selected.asset_code,
      assetIssuer: selected.asset_issuer,
      purpose: purpose.trim() || undefined,
    });

    if (loan) {
      setSuccess(true);
      setBorrower('');
      setAmount('');
      setPurpose('');
    }
  };

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      <h3 className={styles.title}>Originate a Loan</h3>
      <p className={styles.hint}>
        You lend as {lenderAddress.slice(0, 6)}…{lenderAddress.slice(-4)}
      </p>

      <label className={styles.label}>
        Community
        <select
          className={styles.input}
          value={communityId}
          onChange={(e) => setCommunityId(e.target.value)}
        >
          <option value="">Select a community…</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.asset_code})
            </option>
          ))}
        </select>
      </label>

      <label className={styles.label}>
        Borrower address
        <input
          className={styles.input}
          value={borrower}
          onChange={(e) => setBorrower(e.target.value.trim())}
          placeholder="G…"
          spellCheck={false}
        />
      </label>

      <label className={styles.label}>
        Amount {selected && <span className={styles.asset}>{selected.asset_code}</span>}
        <input
          className={styles.input}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
        />
      </label>

      <label className={styles.label}>
        Purpose (optional)
        <input
          className={styles.input}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          maxLength={280}
          placeholder="What is this loan for?"
        />
      </label>

      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>Loan created and awaiting disbursement.</p>}

      <button className={styles.btn} type="submit" disabled={submitting || clientError !== null}>
        {submitting ? 'Creating…' : 'Create loan'}
      </button>
      {clientError && borrower !== '' && <p className={styles.hint}>{clientError}</p>}
    </form>
  );
}
