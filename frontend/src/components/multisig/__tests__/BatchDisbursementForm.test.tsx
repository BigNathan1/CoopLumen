import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BatchDisbursementForm, parseCSVContent } from '../BatchDisbursementForm';

describe('parseCSVContent', () => {
  it('parses valid CSV lines', () => {
    const csv = `recipient,amount,memo\nGA${'A'.repeat(54)},100,Bonus\nGA${'B'.repeat(54)},250`;
    const items = parseCSVContent(csv);

    expect(items).toHaveLength(2);
    expect(items[0].recipient).toBe(`GA${'A'.repeat(54)}`);
    expect(items[0].amount).toBe('100');
    expect(items[0].memo).toBe('Bonus');
    expect(items[0].isValid).toBe(true);

    expect(items[1].recipient).toBe(`GA${'B'.repeat(54)}`);
    expect(items[1].amount).toBe('250');
    expect(items[1].isValid).toBe(true);
  });

  it('detects invalid recipient addresses or negative amounts', () => {
    const csv = `INVALID_ADDRESS,100\nGA${'A'.repeat(54)},-50`;
    const items = parseCSVContent(csv);

    expect(items).toHaveLength(2);
    expect(items[0].isValid).toBe(false);
    expect(items[0].error).toBe('Invalid Stellar address');

    expect(items[1].isValid).toBe(false);
    expect(items[1].error).toBe('Amount must be positive number');
  });
});

describe('BatchDisbursementForm', () => {
  it('renders form controls and updates preview on CSV input', () => {
    render(<BatchDisbursementForm />);

    expect(screen.getByText('Create Batch Disbursement Proposal')).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/Proposal Title/i);
    fireEvent.change(titleInput, { target: { value: 'Disburse Q1' } });

    const csvTextarea = screen.getByLabelText(/Or Paste CSV Data Directly/i);
    fireEvent.change(csvTextarea, {
      target: { value: `GA${'A'.repeat(54)},150,Grant\nGA${'B'.repeat(54)},350` },
    });

    expect(screen.getByText('Total Recipients')).toBeInTheDocument();
    expect(screen.getByText('Total Amount')).toBeInTheDocument();
    expect(screen.getByText('500 XLM')).toBeInTheDocument();
    expect(screen.getByText('Recipients Preview Table')).toBeInTheDocument();
  });

  it('submits valid batch disbursement form', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<BatchDisbursementForm onSubmit={onSubmit} />);

    const titleInput = screen.getByLabelText(/Proposal Title/i);
    fireEvent.change(titleInput, { target: { value: 'Disburse Q1' } });

    const csvTextarea = screen.getByLabelText(/Or Paste CSV Data Directly/i);
    fireEvent.change(csvTextarea, {
      target: { value: `GA${'A'.repeat(54)},150,Grant` },
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Disbursement Proposal/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        [{ recipient: `GA${'A'.repeat(54)}`, amount: '150', memo: 'Grant' }],
        'Disburse Q1',
        undefined
      );
    });
  });

  it('disables submit button when invalid rows exist', () => {
    render(<BatchDisbursementForm />);

    const titleInput = screen.getByLabelText(/Proposal Title/i);
    fireEvent.change(titleInput, { target: { value: 'Disburse Q1' } });

    const csvTextarea = screen.getByLabelText(/Or Paste CSV Data Directly/i);
    fireEvent.change(csvTextarea, {
      target: { value: `BAD_ADDRESS,150` },
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Disbursement Proposal/i });
    expect(submitBtn).toBeDisabled();
  });
});
