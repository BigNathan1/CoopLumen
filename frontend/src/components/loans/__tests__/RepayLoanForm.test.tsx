import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RepayLoanForm } from '../RepayLoanForm';

describe('RepayLoanForm', () => {
  it('submits a valid partial repayment', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RepayLoanForm loanId="loan-1" remainingBalance={200} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/repayment amount/i), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /submit partial repayment/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ loanId: 'loan-1', amount: 75, isFullRepayment: false });
    });
  });

  it('supports quick preset buttons for partial and full repayment', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RepayLoanForm loanId="loan-2" remainingBalance={100} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Full' }));
    fireEvent.click(screen.getByRole('button', { name: /pay full balance/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ loanId: 'loan-2', amount: 100, isFullRepayment: true });
    });
  });

  it('shows accessible validation error when amount exceeds remaining balance', async () => {
    const onSubmit = vi.fn();
    render(<RepayLoanForm loanId="loan-3" remainingBalance={50} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/repayment amount/i), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /pay full balance/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot exceed remaining balance/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});