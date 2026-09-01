import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoansSection } from '../LoansSection';
import type { Loan } from '@/hooks/useLoans';
import type { Community } from '@/hooks/useCommunities';
import * as hook from '@/hooks/useLoans';

const loan: Loan = {
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
  purpose: null,
  status: 'pending',
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

type UseLoansReturn = ReturnType<typeof hook.useLoans>;

function mockUseLoans(value: Partial<UseLoansReturn>): jest.SpyInstance {
  return jest.spyOn(hook, 'useLoans').mockReturnValue(value as UseLoansReturn);
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
    expect(screen.getByText('No loans match these filters.')).toBeInTheDocument();
  });

  it('renders a loan card and the shown count', () => {
    mockUseLoans({ data: [loan], isLoading: false });
    render(<LoansSection />);
    expect(screen.getByText('1 shown')).toBeInTheDocument();
    // The status badge is a span; the filter dropdown also has a "pending" option.
    expect(screen.getByText('pending', { selector: 'span' })).toBeInTheDocument();
  });

  it('passes the selected status filter to the loans hook', async () => {
    const spy = mockUseLoans({ data: [loan], isLoading: false });
    render(<LoansSection communities={[community]} />);

    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'active');

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'active', communityId: undefined })
    );
  });

  it('only shows the community filter when communities are provided', () => {
    mockUseLoans({ data: [], isLoading: false });
    const { rerender } = render(<LoansSection />);
    expect(screen.queryByLabelText('Filter by community')).not.toBeInTheDocument();

    rerender(<LoansSection communities={[community]} />);
    expect(screen.getByLabelText('Filter by community')).toBeInTheDocument();
  });
});
