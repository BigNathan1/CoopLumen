'use client';

import Link from 'next/link';
import { useState, useId, FormEvent, ChangeEvent } from 'react';
import { useCommunity } from '@/hooks/useCommunities';
import { useLoans, type Loan, type LoanStatus } from '@/hooks/useLoans';
import { useLoanActions } from '@/hooks/useLoanActions';
import { useWallet } from '@/hooks/useWallet';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { formatAmount, truncateAddress } from '@/lib/format';
import { sanitizeUserText } from '@/lib/sanitize';
import styles from './LoansPage.module.css';

const STATUS_META: Record<LoanStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pending', variant: 'warning' },
  active: { label: 'Active', variant: 'info' },
  repaid: { label: 'Repaid', variant: 'success' },
  defaulted: { label: 'Defaulted', variant: 'error' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
};

/**
 * Client component that fetches and renders the community loans view.
 *
 * Separated from the page shell so unit tests can render it directly without
 * mocking Next.js `params` resolution.
 *
 * Accessibility:
 * - Single `<h1>` from the page shell; loans section carries `<h2>`.
 * - `<main>` landmark with an accessible name (delegated to page shell).
 * - Request loan form fields are labelled with visible `<label>` elements.
 * - Validation messages use `role="alert"`.
 * - Loading states use `role="status"` (Spinner / LoadingSkeleton).
 * - Action buttons carry `aria-label` naming the specific loan.
 * - Confirm dialogs are modal and focus-trapped (Modal).
 */
export function LoansPage({ communityId }: { communityId: string }) {
  const {
    data: community,
    error: communityError,
    isLoading: communityLoading,
  } = useCommunity(communityId);
  const {
    data: loans,
    error: loansError,
    isLoading: loansLoading,
  } = useLoans({
    communityId,
    limit: 20,
  });
  const { publicKey } = useWallet();

  // State for request loan modal
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestPurpose, setRequestPurpose] = useState('');
  const [requestInterestRate, setRequestInterestRate] = useState(0);
  const [requestDueAt, setRequestDueAt] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  // State for repay modal
  const [repayLoan, setRepayLoan] = useState<Loan | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayError, setRepayError] = useState<string | null>(null);

  // State for confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{
    type: 'disburse' | 'default' | 'cancel';
    loan: Loan;
  } | null>(null);

  const amountInputId = useId();
  const purposeInputId = useId();
  const interestRateInputId = useId();
  const dueAtInputId = useId();
  const repayAmountInputId = useId();

  // Community loading state
  if (communityLoading) {
    return (
      <main className={styles.page} aria-label="Community loans">
        <div className={styles.inner}>
          <div className={styles.centred}>
            <Spinner size="lg" label="Loading community…" />
          </div>
        </div>
      </main>
    );
  }

  if (communityError || !community) {
    return (
      <main className={styles.page} aria-label="Community loans">
        <div className={styles.inner}>
          <Link href="/communities" className={styles.backLink}>
            <span className={styles.backArrow} aria-hidden="true" />
            Back to communities
          </Link>
          <div className={styles.errorWrap}>
            <Alert variant="error" title="Community not found">
              {communityError
                ? communityError.message
                : 'This community does not exist or could not be loaded.'}
            </Alert>
          </div>
        </div>
      </main>
    );
  }

  // Determine user role in this community (from wallet)
  const isMember = Boolean(publicKey);

  // Table columns
  const columns: TableColumn<Loan>[] = [
    {
      key: 'borrower_address',
      label: 'Borrower',
      render: (_value, row) => (
        <span className={styles.addressCell}>
          <code title={row.borrower_address}>{truncateAddress(row.borrower_address)}</code>
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      className: styles.numeric,
      headerClassName: styles.numericHeader,
      render: (_value, row) => (
        <span className={styles.amount}>
          {formatAmount(row.amount)} {row.asset_code}
        </span>
      ),
    },
    {
      key: 'total_due',
      label: 'Total Due',
      className: styles.numeric,
      headerClassName: styles.numericHeader,
      render: (_value, row) => (
        <span className={styles.amount}>
          {formatAmount(row.total_due)} {row.asset_code}
        </span>
      ),
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      className: styles.numeric,
      headerClassName: styles.numericHeader,
      render: (_value, row) => (
        <span className={styles.outstanding}>
          {formatAmount(row.outstanding)} {row.asset_code}
        </span>
      ),
    },
    {
      key: 'interest_rate',
      label: 'Interest',
      className: styles.numeric,
      headerClassName: styles.numericHeader,
      render: (_value, row) => (
        <span className={styles.interest}>{parseFloat(row.interest_rate).toFixed(2)}%</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_value, row) => {
        const { label, variant } = STATUS_META[row.status];
        return (
          <Badge variant={variant} size="sm">
            {label}
          </Badge>
        );
      },
    },
    {
      key: 'due_at',
      label: 'Due',
      render: (_value, row) =>
        row.due_at ? (
          <time className={styles.date} dateTime={row.due_at}>
            {new Date(row.due_at).toLocaleDateString()}
          </time>
        ) : (
          <span className={styles.muted}>—</span>
        ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value, row) => <LoanActions loan={row} publicKey={publicKey} />,
    },
  ];

  // Request loan handler
  const handleRequestLoan = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRequestError(null);

    if (!publicKey) {
      setRequestError('Please connect your wallet first.');
      return;
    }

    const amount = requestAmount.trim();
    const purpose = requestPurpose.trim();
    const dueAt = requestDueAt;
    const interestRate = requestInterestRate;

    if (!amount || parseFloat(amount) <= 0) {
      setRequestError('Enter a valid amount greater than 0.');
      return;
    }

    if (!dueAt) {
      setRequestError('Select a due date.');
      return;
    }

    if (new Date(dueAt) <= new Date()) {
      setRequestError('Due date must be in the future.');
      return;
    }

    setRequestSubmitting(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/loans/request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId,
            amount,
            purpose: purpose || undefined,
            dueAt,
            interestRate: interestRate > 0 ? interestRate : undefined,
          }),
        }
      );

      const body = (await res.json().catch(() => ({}))) as {
        data?: Loan;
        error?: string;
        meta?: { maxLoanAmount?: string };
      };

      if (!res.ok) {
        if (body.meta?.maxLoanAmount && res.status === 400) {
          throw new Error(
            `Loan request exceeds loan-to-value limit. Maximum: ${formatAmount(body.meta.maxLoanAmount)} ${community.asset_code}`
          );
        }
        throw new Error(body.error ?? 'Failed to request loan');
      }

      setIsRequestOpen(false);
      setRequestAmount('');
      setRequestPurpose('');
      setRequestInterestRate(0);
      setRequestDueAt('');

      // Revalidate loans list
      window.location.reload();
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to request loan');
    } finally {
      setRequestSubmitting(false);
    }
  };

  // Repay handler
  const handleRepay = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRepayError(null);

    if (!repayLoan) return;

    const amount = repayAmount.trim();
    if (!amount || parseFloat(amount) <= 0) {
      setRepayError('Enter a valid amount greater than 0.');
      return;
    }

    if (parseFloat(amount) > parseFloat(repayLoan.outstanding) + 1e-7) {
      setRepayError(
        `Amount exceeds outstanding balance of ${formatAmount(repayLoan.outstanding)} ${repayLoan.asset_code}.`
      );
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/loans/${repayLoan.id}/repay`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount }),
        }
      );

      const body = (await res.json().catch(() => ({}))) as { data?: Loan; error?: string };

      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to repay loan');
      }

      setRepayLoan(null);
      setRepayAmount('');
      window.location.reload();
    } catch (err) {
      setRepayError(err instanceof Error ? err.message : 'Failed to repay loan');
    }
  };

  // Confirm action handler
  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    const { type, loan } = confirmAction;
    let endpoint = '';
    let body: Record<string, unknown> = {};

    if (type === 'disburse') {
      endpoint = `${loan.id}/disburse`;
    } else if (type === 'default') {
      endpoint = `${loan.id}/default`;
    } else if (type === 'cancel') {
      endpoint = loan.id;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/loans/${endpoint}`,
        {
          method: type === 'cancel' ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const body = (await res.json().catch(() => ({}))) as { data?: Loan; error?: string };

      if (!res.ok) {
        throw new Error(body.error ?? `Failed to ${type} loan`);
      }

      setConfirmAction(null);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${type} loan`);
    }
  };

  // Check if user is the borrower or lender for a loan
  const canActAsBorrower = (loan: Loan) => publicKey === loan.borrower_address;
  const canActAsLender = (loan: Loan) => publicKey === loan.lender_address;

  return (
    <main className={styles.page} aria-label={`${community.name} loans`}>
      <div className={styles.inner}>
        {/* Back navigation */}
        <Link href={`/communities/${communityId}`} className={styles.backLink}>
          <span className={styles.backArrow} aria-hidden="true" />
          Back to {community.name}
        </Link>

        <header className={styles.header}>
          <h1 className={styles.title}>Loans</h1>
          <p className={styles.subtitle}>{community.name}</p>
          {isMember && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsRequestOpen(true)}
              className={styles.requestButton}
            >
              Request Loan
            </Button>
          )}
        </header>

        {/* Loans table section */}
        <section aria-labelledby="loans-heading" className={styles.section}>
          <h2 id="loans-heading" className={styles.sectionHeading}>
            Community Pool Loans
            {loans && (
              <span className={styles.count} aria-label={`${loans.length} loans`}>
                {loans.length}
              </span>
            )}
          </h2>

          {loansLoading && (
            <div className={styles.tableWrapper} aria-label="Loans loading">
              <LoadingSkeleton variant="rect" height={44} count={5} gap={8} label="Loading loans" />
            </div>
          )}

          {loansError && (
            <Alert variant="error" title="Could not load loans">
              {loansError.message}
            </Alert>
          )}

          {!loansLoading && !loansError && loans && loans.length === 0 && (
            <EmptyState
              title="No loans yet"
              message={
                isMember
                  ? 'Be the first to request a loan from the community pool.'
                  : 'Connect your wallet to request a loan.'
              }
            />
          )}

          {!loansLoading && !loansError && loans && loans.length > 0 && (
            <div className={styles.tableWrapper}>
              <Table<Loan>
                columns={columns}
                data={loans}
                ariaLabel={`${community.name} loans`}
                emptyMessage="No loans yet."
              />
            </div>
          )}
        </section>

        {/* Request Loan Modal */}
        <Modal
          isOpen={isRequestOpen}
          onClose={() => setIsRequestOpen(false)}
          title="Request a Loan"
          description="Borrow from the community pool. Your loan-to-value limit is based on your token holdings."
          size="md"
        >
          <form onSubmit={handleRequestLoan} noValidate className={styles.form}>
            <div className={styles.field}>
              <label htmlFor={amountInputId} className={styles.label}>
                Amount{' '}
                <span aria-hidden="true" className={styles.requiredMark}>
                  *
                </span>
              </label>
              <input
                id={amountInputId}
                type="number"
                step="0.0000001"
                min="0.0000001"
                value={requestAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRequestAmount(e.target.value)}
                placeholder="1000"
                className={styles.input}
                required
                aria-required="true"
              />
              <p className={styles.helperText}>
                Maximum amount depends on your {community.asset_code} holdings and the
                community&apos;s LTV limit.
              </p>
            </div>

            <div className={styles.field}>
              <label htmlFor={purposeInputId} className={styles.label}>
                Purpose (optional)
              </label>
              <input
                id={purposeInputId}
                type="text"
                value={requestPurpose}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRequestPurpose(e.target.value)}
                placeholder="Business expansion, emergency fund, etc."
                maxLength={500}
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={interestRateInputId} className={styles.label}>
                Interest Rate (%)
              </label>
              <input
                id={interestRateInputId}
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={requestInterestRate}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRequestInterestRate(parseFloat(e.target.value) || 0)
                }
                placeholder="5"
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={dueAtInputId} className={styles.label}>
                Due Date{' '}
                <span aria-hidden="true" className={styles.requiredMark}>
                  *
                </span>
              </label>
              <input
                id={dueAtInputId}
                type="date"
                value={requestDueAt}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRequestDueAt(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} // Tomorrow
                className={styles.input}
                required
                aria-required="true"
              />
            </div>

            {requestError && (
              <Alert variant="error" title="Could not request loan">
                {requestError}
              </Alert>
            )}

            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={() => setIsRequestOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={requestSubmitting}
                loadingLabel="Requesting…"
              >
                Request Loan
              </Button>
            </div>
          </form>
        </Modal>

        {/* Repay Modal */}
        <Modal
          isOpen={Boolean(repayLoan)}
          onClose={() => setRepayLoan(null)}
          title="Repay Loan"
          description={`Repay loan #${repayLoan?.id.slice(0, 8)}…`}
          size="md"
        >
          <form onSubmit={handleRepay} noValidate className={styles.form}>
            <div className={styles.field}>
              <label htmlFor={repayAmountInputId} className={styles.label}>
                Amount{' '}
                <span aria-hidden="true" className={styles.requiredMark}>
                  *
                </span>
              </label>
              <input
                id={repayAmountInputId}
                type="number"
                step="0.0000001"
                min="0.0000001"
                max={repayLoan?.outstanding}
                value={repayAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRepayAmount(e.target.value)}
                placeholder={repayLoan?.outstanding}
                className={styles.input}
                required
                aria-required="true"
              />
              <p className={styles.helperText}>
                Outstanding:{' '}
                <strong>
                  {repayLoan
                    ? `${formatAmount(repayLoan.outstanding)} ${repayLoan.asset_code}`
                    : ''}
                </strong>
              </p>
            </div>

            {repayError && (
              <Alert variant="error" title="Could not repay">
                {repayError}
              </Alert>
            )}

            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={() => setRepayLoan(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Repay
              </Button>
            </div>
          </form>
        </Modal>

        {/* Confirm Action Modal */}
        <Modal
          isOpen={Boolean(confirmAction)}
          onClose={() => setConfirmAction(null)}
          title={
            confirmAction?.type === 'disburse'
              ? 'Disburse Loan?'
              : confirmAction?.type === 'default'
                ? 'Mark Loan as Defaulted?'
                : 'Cancel Loan?'
          }
          description={
            confirmAction
              ? `This will ${confirmAction.type} loan #${confirmAction.loan.id.slice(0, 8)}… for ${formatAmount(confirmAction.loan.amount)} ${confirmAction.loan.asset_code}.`
              : ''
          }
          size="md"
          variant={confirmAction?.type === 'default' ? 'danger' : 'default'}
          confirmLabel={
            confirmAction?.type === 'disburse'
              ? 'Disburse'
              : confirmAction?.type === 'default'
                ? 'Mark Defaulted'
                : 'Cancel'
          }
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      </div>
    </main>
  );
}

/** Inline actions for a single loan row. */
function LoanActions({ loan, publicKey }: { loan: Loan; publicKey: string | null }) {
  const isBorrower = publicKey === loan.borrower_address;
  const isLender = publicKey === loan.lender_address;

  // Borrower actions
  if (isBorrower) {
    if (loan.status === 'active') {
      return (
        <Button
          size="sm"
          variant="primary"
          onClick={() => setRepayLoan(loan)}
          aria-label={`Repay loan ${truncateAddress(loan.borrower_address)}`}
        >
          Repay
        </Button>
      );
    }
    if (loan.status === 'pending') {
      return (
        <Button
          size="sm"
          variant="danger"
          onClick={() => setConfirmAction({ type: 'cancel', loan })}
          aria-label={`Cancel loan ${truncateAddress(loan.borrower_address)}`}
        >
          Cancel
        </Button>
      );
    }
    return <span className={styles.muted}>—</span>;
  }

  // Lender actions (community issuer)
  if (isLender) {
    if (loan.status === 'pending') {
      return (
        <Button
          size="sm"
          variant="primary"
          onClick={() => setConfirmAction({ type: 'disburse', loan })}
          aria-label={`Disburse loan ${truncateAddress(loan.borrower_address)}`}
        >
          Disburse
        </Button>
      );
    }
    if (loan.status === 'active') {
      return (
        <Button
          size="sm"
          variant="danger"
          onClick={() => setConfirmAction({ type: 'default', loan })}
          aria-label={`Mark loan ${truncateAddress(loan.borrower_address)} as defaulted`}
        >
          Mark Defaulted
        </Button>
      );
    }
    return <span className={styles.muted}>—</span>;
  }

  // Other members - view only
  return <span className={styles.muted}>—</span>;
}
