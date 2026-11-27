import { render, screen } from '@testing-library/react';
import { LoanDetail } from '../LoanDetail';
import type { LoanDetail as LoanDetailType } from '@/hooks/useLoans';
import * as loansHook from '@/hooks/useLoans';

const baseLoan: LoanDetailType = {
  id: 'loan-1',
  community_id: 'community-1',
  borrower_address: 'G' + 'A'.repeat(55),
  lender_address: 'G' + 'B'.repeat(55),
  amount: '100.0000000',
  amount_repaid: '40.0000000',
  interest_rate: '0',
  total_due: '100.0000000',
  outstanding: '60.0000000',
  asset_code: 'ECO',
  asset_issuer: null,
  purpose: 'Seed capital',
  status: 'active',
  due_at: '2026-12-31T23:59:59.000Z',
  disbursed_at: '2026-01-15T10:00:00.000Z',
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  events: [
    {
      id: 'ev-1',
      loan_id: 'loan-1',
      event_type: 'created',
      amount: '100.0000000',
      payment_id: null,
      note: 'Initial loan request',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'ev-2',
      loan_id: 'loan-1',
      event_type: 'disbursed',
      amount: '100.0000000',
      payment_id: 'pay-1',
      note: 'Funds sent to borrower',
      created_at: '2026-01-15T10:00:00.000Z',
    },
    {
      id: 'ev-3',
      loan_id: 'loan-1',
      event_type: 'repayment',
      amount: '25.0000000',
      payment_id: 'pay-2',
      note: 'First monthly payment',
      created_at: '2026-02-15T10:00:00.000Z',
    },
    {
      id: 'ev-4',
      loan_id: 'loan-1',
      event_type: 'repayment',
      amount: '15.0000000',
      payment_id: 'pay-3',
      note: 'Second payment',
      created_at: '2026-03-15T10:00:00.000Z',
    },
  ],
};

describe('LoanDetail', () => {
  beforeEach(() => {
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: baseLoan,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders loan title with ID', () => {
    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText(/Loan loan-1/)).toBeInTheDocument();
  });

  it('renders status badge with correct variant', () => {
    render(<LoanDetail loanId="loan-1" />);
    const status = screen.getByText('active');
    expect(status).toHaveClass('active');
  });

  it('renders summary fields: amount, total due, outstanding', () => {
    render(<LoanDetail loanId="loan-1" />);
    const amounts = screen.getAllByText('100.00');
    expect(amounts.length).toBeGreaterThanOrEqual(1);
    const ecoElements = screen.getAllByText('ECO');
    expect(ecoElements.length).toBeGreaterThanOrEqual(1);
    const outstanding = screen.getAllByText('60.00');
    expect(outstanding.length).toBeGreaterThanOrEqual(1);
  });

  it('renders interest rate when > 0', () => {
    const loanWithInterest = {
      ...baseLoan,
      interest_rate: '10.00',
      total_due: '110.0000000',
      outstanding: '70.0000000',
    };
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: loanWithInterest,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText(/10%/)).toBeInTheDocument();
    expect(screen.getByText(/110.00/)).toBeInTheDocument();
  });

  it('omits interest line when rate is 0', () => {
    render(<LoanDetail loanId="loan-1" />);
    expect(screen.queryByText(/interest/i)).not.toBeInTheDocument();
  });

  it('renders repayment progress bar', () => {
    render(<LoanDetail loanId="loan-1" />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '40');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  it('shows 100% progress when fully repaid', () => {
    const repaidLoan = {
      ...baseLoan,
      status: 'repaid',
      amount_repaid: '100.0000000',
      outstanding: '0',
      closed_at: '2026-06-01T00:00:00.000Z',
    };
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: repaidLoan,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders due date when present', () => {
    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText(/1 Jan 2027/)).toBeInTheDocument();
  });

  it('renders created, disbursed, and closed dates', () => {
    render(<LoanDetail loanId="loan-1" />);
    const createdDates = screen.getAllByText(/1 Jan 2026/);
    expect(createdDates.length).toBeGreaterThanOrEqual(1);
    const disbursedDates = screen.getAllByText(/15 Jan 2026/);
    expect(disbursedDates.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Closed/)).not.toBeInTheDocument();
  });

  it('renders closed date when loan is closed', () => {
    const closedLoan = { ...baseLoan, status: 'repaid', closed_at: '2026-06-01T00:00:00.000Z' };
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: closedLoan,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText(/1 Jun 2026/)).toBeInTheDocument();
  });

  it('renders purpose when present', () => {
    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText('Seed capital')).toBeInTheDocument();
  });

  it('omits purpose section when not present', () => {
    const loanNoPurpose = { ...baseLoan, purpose: null };
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: loanNoPurpose,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    expect(screen.queryByText(/Purpose/)).not.toBeInTheDocument();
  });

  it('renders borrower and lender addresses shortened', () => {
    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText(/Borrower/)).toBeInTheDocument();
    expect(screen.getByText(/GAAA…AAAA/)).toBeInTheDocument();
    expect(screen.getByText(/Lender/)).toBeInTheDocument();
    expect(screen.getByText(/GBBB…BBBB/)).toBeInTheDocument();
  });

  it('renders repayment timeline with only repayment and closed events', () => {
    render(<LoanDetail loanId="loan-1" />);
    const timeline = screen.getByRole('list', { name: /Repayment events/ });
    expect(timeline).toBeInTheDocument();

    const items = timeline.querySelectorAll('li');
    expect(items).toHaveLength(2);
    const notes = screen.getAllByText('First monthly payment');
    expect(notes.length).toBeGreaterThanOrEqual(1);
    const notes2 = screen.getAllByText('Second payment');
    expect(notes2.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no repayment events', () => {
    const loanNoRepayments = { ...baseLoan, events: [] };
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: loanNoRepayments,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText(/No repayments recorded yet/)).toBeInTheDocument();
  });

  it('renders all events list with all event types', () => {
    render(<LoanDetail loanId="loan-1" />);
    const eventList = screen.getByRole('list', { name: /All loan events/ });
    expect(eventList).toBeInTheDocument();

    const createdElements = screen.getAllByText('Created');
    expect(createdElements.length).toBeGreaterThanOrEqual(1);
    const disbursedElements = screen.getAllByText('Disbursed');
    expect(disbursedElements.length).toBeGreaterThanOrEqual(1);
    const repaymentElements = screen.getAllByText('Repayment');
    expect(repaymentElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Initial loan request')).toBeInTheDocument();
    expect(screen.getByText('Funds sent to borrower')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('shows error state with retry button when fetch fails', () => {
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: undefined,
      error: new Error('Failed'),
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText(/Could not load loan details/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });

  it('renders status badge correctly for repaid status', () => {
    const repaidLoan = { ...baseLoan, status: 'repaid' };
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: repaidLoan,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    const status = screen.getByText('repaid');
    expect(status).toHaveClass('repaid');
  });

  it('renders status badge correctly for defaulted status', () => {
    const defaultedLoan = { ...baseLoan, status: 'defaulted' };
    jest.spyOn(loansHook, 'useLoan').mockReturnValue({
      data: defaultedLoan,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as ReturnType<typeof loansHook.useLoan>);

    render(<LoanDetail loanId="loan-1" />);
    const status = screen.getByText('defaulted');
    expect(status).toHaveClass('defaulted');
  });

  it('renders community ID', () => {
    render(<LoanDetail loanId="loan-1" />);
    expect(screen.getByText('community-1')).toBeInTheDocument();
  });
});
