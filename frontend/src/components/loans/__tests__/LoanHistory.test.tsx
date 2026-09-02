import { render, screen } from '@testing-library/react';
import { LoanHistory } from '../LoanHistory';
import type { LoanDetail } from '@/hooks/useLoans';
import * as hook from '@/hooks/useLoans';

type UseLoanReturn = ReturnType<typeof hook.useLoan>;

function mockUseLoan(value: Partial<UseLoanReturn>): void {
  jest.spyOn(hook, 'useLoan').mockReturnValue(value as UseLoanReturn);
}

const detail = {
  outstanding: '60.0000000',
  events: [
    {
      id: 'ev-1',
      loan_id: 'loan-1',
      event_type: 'created',
      amount: '100.0000000',
      payment_id: null,
      note: 'Seed capital',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'ev-2',
      loan_id: 'loan-1',
      event_type: 'repayment',
      amount: '40.0000000',
      payment_id: null,
      note: null,
      created_at: '2026-02-01T00:00:00.000Z',
    },
  ],
} as LoanDetail;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LoanHistory', () => {
  it('shows a loading state', () => {
    mockUseLoan({ isLoading: true });
    render(<LoanHistory loanId="loan-1" />);
    expect(screen.getByText('Loading history…')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    mockUseLoan({ error: new Error('boom'), isLoading: false });
    render(<LoanHistory loanId="loan-1" />);
    expect(screen.getByText('Could not load history')).toBeInTheDocument();
  });

  it('renders each event with a human-readable label', () => {
    mockUseLoan({ data: detail, isLoading: false });
    render(<LoanHistory loanId="loan-1" />);
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Repayment')).toBeInTheDocument();
    expect(screen.getByText('Seed capital')).toBeInTheDocument();
  });
});
