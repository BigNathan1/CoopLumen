import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoanActions } from '../LoanActions';
import type { Loan } from '@/hooks/useLoans';
import * as hook from '@/hooks/useLoanActions';

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
  purpose: null,
  status: 'pending',
  due_at: null,
  disbursed_at: null,
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

type Actions = ReturnType<typeof hook.useLoanActions>;

function mockActions(overrides: Partial<Actions> = {}): Actions {
  const actions: Actions = {
    disburse: jest.fn().mockResolvedValue(baseLoan),
    repay: jest.fn().mockResolvedValue(baseLoan),
    markDefaulted: jest.fn().mockResolvedValue(baseLoan),
    cancel: jest.fn().mockResolvedValue(baseLoan),
    pending: false,
    error: null,
    ...overrides,
  };
  jest.spyOn(hook, 'useLoanActions').mockReturnValue(actions);
  return actions;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LoanActions', () => {
  it('renders nothing for a terminal loan', () => {
    mockActions();
    const { container } = render(<LoanActions loan={{ ...baseLoan, status: 'repaid' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers disburse and cancel for a pending loan', async () => {
    const actions = mockActions();
    render(<LoanActions loan={baseLoan} />);

    await userEvent.click(screen.getByRole('button', { name: 'Disburse' }));
    expect(actions.disburse).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(actions.cancel).toHaveBeenCalledTimes(1);
  });

  it('disables repay until a valid amount within the outstanding balance', async () => {
    const actions = mockActions();
    render(<LoanActions loan={{ ...baseLoan, status: 'active' }} />);

    const repayBtn = screen.getByRole('button', { name: 'Repay' });
    expect(repayBtn).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Repay amount'), '250');
    expect(repayBtn).toBeDisabled(); // exceeds the 100 outstanding

    await userEvent.clear(screen.getByLabelText('Repay amount'));
    await userEvent.type(screen.getByLabelText('Repay amount'), '25');
    expect(repayBtn).toBeEnabled();

    await userEvent.click(repayBtn);
    expect(actions.repay).toHaveBeenCalledWith('25');
  });

  it('marks a loan defaulted', async () => {
    const actions = mockActions();
    render(<LoanActions loan={{ ...baseLoan, status: 'active' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark defaulted' }));
    expect(actions.markDefaulted).toHaveBeenCalledTimes(1);
  });
});
