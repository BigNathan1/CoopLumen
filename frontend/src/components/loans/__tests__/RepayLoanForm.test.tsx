import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepayLoanForm, type RepayLoanFormProps } from '../RepayLoanForm';

const loan: RepayLoanFormProps['loan'] = {
  id: 'loan-1',
  outstanding: '100.0000000',
  total_due: '105.0000000',
  amount_repaid: '5.0000000',
  asset_code: 'ECO',
};

function setup(props: Partial<RepayLoanFormProps> = {}) {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<RepayLoanForm loan={loan} onSubmit={onSubmit} {...props} />);
  const input = screen.getByLabelText(/Repayment amount/i);
  return { onSubmit, user, input };
}

describe('RepayLoanForm', () => {
  it('shows the remaining balance', () => {
    setup();
    expect(screen.getByText(/Remaining balance: 100.0000000 ECO/)).toBeInTheDocument();
  });

  it('submits a partial repayment', async () => {
    const { onSubmit, user, input } = setup();
    await user.type(input, '40');
    await user.click(screen.getByRole('button', { name: 'Submit Partial Repayment' }));
    expect(onSubmit).toHaveBeenCalledWith({
      loanId: 'loan-1',
      amount: '40',
      isFullRepayment: false,
    });
  });

  it('sends the exact server balance for a full repayment', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Full' }));
    await user.click(screen.getByRole('button', { name: 'Pay Full Balance' }));
    expect(onSubmit).toHaveBeenCalledWith({
      loanId: 'loan-1',
      amount: '100.0000000',
      isFullRepayment: true,
    });
  });

  it('fills a percentage preset', async () => {
    const { user, input } = setup();
    await user.click(screen.getByRole('button', { name: '25%' }));
    expect(input).toHaveValue(25);
  });

  it('rejects an amount above the remaining balance', async () => {
    const { onSubmit, user, input } = setup();
    await user.type(input, '150');
    await user.click(screen.getByRole('button', { name: 'Pay Full Balance' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot exceed remaining balance/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an amount below the minimum', async () => {
    const { onSubmit, user, input } = setup({ minRepayment: '1' });
    await user.type(input, '0.5');
    await user.click(screen.getByRole('button', { name: 'Submit Partial Repayment' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Minimum repayment is 1 ECO.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the error when submission fails', async () => {
    const { user, input } = setup({
      onSubmit: jest.fn().mockRejectedValue(new Error('Horizon down')),
    });
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: 'Submit Partial Repayment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Horizon down');
  });

  it('disables the form when nothing is outstanding', () => {
    setup({ loan: { ...loan, outstanding: '0' } });
    expect(screen.getByLabelText(/Repayment amount/i)).toBeDisabled();
  });
});
