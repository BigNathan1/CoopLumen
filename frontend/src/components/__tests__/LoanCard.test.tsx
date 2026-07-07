import { render, screen } from '@testing-library/react';
import { LoanCard } from '../LoanCard';
import type { Loan } from '@/hooks/useLoans';

const baseLoan: Loan = {
  id: 'loan-1',
  community_id: 'community-1',
  borrower_address: 'G' + 'A'.repeat(55),
  lender_address: 'G' + 'B'.repeat(55),
  amount: '100.0000000',
  amount_repaid: '40.0000000',
  asset_code: 'ECO',
  asset_issuer: null,
  purpose: 'Seed capital',
  status: 'active',
  due_at: null,
  disbursed_at: null,
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('LoanCard', () => {
  it('renders amount, asset code, status, and purpose', () => {
    render(<LoanCard loan={baseLoan} />);
    expect(screen.getByText('100.00')).toBeInTheDocument();
    expect(screen.getByText('ECO')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Seed capital')).toBeInTheDocument();
  });

  it('shows the outstanding balance for an active, partly-repaid loan', () => {
    render(<LoanCard loan={baseLoan} />);
    expect(screen.getByText(/Outstanding 60.00 ECO/)).toBeInTheDocument();
  });

  it('omits the outstanding line once a loan is repaid', () => {
    render(<LoanCard loan={{ ...baseLoan, status: 'repaid', amount_repaid: '100.0000000' }} />);
    expect(screen.queryByText(/Outstanding/)).not.toBeInTheDocument();
  });

  it('shortens borrower and lender addresses', () => {
    render(<LoanCard loan={baseLoan} />);
    expect(screen.getByText(/Borrower GAAA…AAAA/)).toBeInTheDocument();
    expect(screen.getByText(/Lender GBBB…BBBB/)).toBeInTheDocument();
  });
});
