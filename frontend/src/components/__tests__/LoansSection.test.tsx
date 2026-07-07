import { render, screen } from '@testing-library/react';
import { LoansSection } from '../LoansSection';
import type { Loan } from '@/hooks/useLoans';
import * as hook from '@/hooks/useLoans';

const loan: Loan = {
  id: 'loan-1',
  community_id: 'community-1',
  borrower_address: 'G' + 'A'.repeat(55),
  lender_address: 'G' + 'B'.repeat(55),
  amount: '100.0000000',
  amount_repaid: '0',
  asset_code: 'ECO',
  asset_issuer: null,
  purpose: null,
  status: 'pending',
  due_at: null,
  disbursed_at: null,
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

type UseLoansReturn = ReturnType<typeof hook.useLoans>;

function mockUseLoans(value: Partial<UseLoansReturn>): void {
  jest.spyOn(hook, 'useLoans').mockReturnValue(value as UseLoansReturn);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LoansSection', () => {
  it('renders a loading state', () => {
    mockUseLoans({ isLoading: true });
    render(<LoansSection />);
    expect(screen.getByText('Loading loans…')).toBeInTheDocument();
  });

  it('renders an error state', () => {
    mockUseLoans({ error: new Error('boom'), isLoading: false });
    render(<LoansSection />);
    expect(screen.getByText('Could not load loans.')).toBeInTheDocument();
  });

  it('renders an empty state', () => {
    mockUseLoans({ data: [], isLoading: false });
    render(<LoansSection />);
    expect(screen.getByText('No loans yet.')).toBeInTheDocument();
  });

  it('renders a loan card and the shown count', () => {
    mockUseLoans({ data: [loan], isLoading: false });
    render(<LoansSection />);
    expect(screen.getByText('1 shown')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});
