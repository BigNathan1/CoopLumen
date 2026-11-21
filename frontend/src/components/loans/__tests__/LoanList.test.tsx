import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoanList } from '../LoanList';
import type { Loan } from '@/hooks/useLoans';
import type { Community } from '@/hooks/useCommunities';
import * as loansHook from '@/hooks/useLoans';

const baseLoan: Loan = {
  id: 'loan-1',
  community_id: 'community-1',
  borrower_address: 'G' + 'A'.repeat(55),
  lender_address: 'G' + 'B'.repeat(55),
  amount: '100.0000000',
  amount_repaid: '0',
  interest_rate: '0',
  total_due: '100.0000000',
  outstanding: '100.0000000',
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

const community: Community = {
  id: 'community-1',
  name: 'EcoDAO',
  description: null,
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  issuer_public_key: 'G' + 'A'.repeat(55),
  created_at: '2026-01-01T00:00:00.000Z',
};

let useLoansSpy: jest.SpyInstance;

function mockUseLoans(overrides: Partial<ReturnType<typeof loansHook.useLoans>> = {}) {
  useLoansSpy = jest.spyOn(loansHook, 'useLoans').mockReturnValue({
    data: [baseLoan],
    error: null,
    isLoading: false,
    isValidating: false,
    mutate: jest.fn(),
    ...overrides,
  } as ReturnType<typeof loansHook.useLoans>);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LoanList', () => {
  beforeEach(() => {
    mockUseLoans();
  });

  it('renders title and loan count', () => {
    render(<LoanList />);
    expect(screen.getByText('Loans')).toBeInTheDocument();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
  });

  it('renders status tabs with correct labels', () => {
    render(<LoanList />);

    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pending' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Defaulted' })).toBeInTheDocument();
  });

  it('highlights active tab and calls useLoans with correct status', async () => {
    render(<LoanList />);

    await userEvent.click(screen.getByRole('tab', { name: 'Pending' }));

    expect(screen.getByRole('tab', { name: 'Pending' })).toHaveAttribute('aria-selected', 'true');
    expect(useLoansSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('shows All tab as active by default', () => {
    render(<LoanList />);

    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders community filter when communities provided', () => {
    render(<LoanList communities={[community]} />);

    expect(screen.getByLabelText('Filter by community')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'EcoDAO' })).toBeInTheDocument();
  });

  it('hides community filter when no communities', () => {
    render(<LoanList communities={[]} />);

    expect(screen.queryByLabelText('Filter by community')).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseLoans({ isLoading: true, data: undefined });
    render(<LoanList />);

    expect(screen.getByText(/Loading loans/)).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseLoans({ error: new Error('Failed'), data: undefined, isLoading: false });
    render(<LoanList />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load loans/);
  });

  it('shows empty state when no loans match', () => {
    mockUseLoans({ data: [], isLoading: false });
    render(<LoanList />);

    expect(screen.getByText(/No loans match these filters/)).toBeInTheDocument();
  });

  it('renders LoanCard for each loan', () => {
    mockUseLoans({ data: [baseLoan, { ...baseLoan, id: 'loan-2' }] });
    render(<LoanList />);

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
  });

  it('updates community filter and calls useLoans with communityId', async () => {
    render(<LoanList communities={[community]} />);

    await userEvent.selectOptions(screen.getByLabelText('Filter by community'), 'community-1');

    expect(useLoansSpy).toHaveBeenCalledWith(expect.objectContaining({ communityId: 'community-1' }));
  });

  it('tabpanel has correct aria-labelledby', () => {
    render(<LoanList />);

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-all');
  });

  it('active tab uses primary variant', () => {
    render(<LoanList />);

    const activeTab = screen.getByRole('tab', { name: 'All', selected: true });
    expect(activeTab).toHaveClass('primary');
  });

  it('inactive tabs use ghost variant', () => {
    render(<LoanList />);

    const inactiveTab = screen.getByRole('tab', { name: 'Pending', selected: false });
    expect(inactiveTab).toHaveClass('ghost');
  });
});