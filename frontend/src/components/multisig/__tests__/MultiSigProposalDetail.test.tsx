import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MultiSigProposalDetail } from '../MultiSigProposalDetail';
import type { MultiSigRequest } from '../../../hooks/useMultiSig';

const mockRequest: MultiSigRequest = {
  id: 'req-101',
  community_id: 'comm-1',
  proposer_address: 'G' + 'A'.repeat(55),
  action: 'payment',
  title: 'Community Fund Disbursement',
  description: 'Disburse funds for local project',
  payload: { recipient: 'G' + 'B'.repeat(55), amount: '500' },
  transaction_xdr: null,
  required_signatures: 3,
  current_signatures: 2,
  status: 'pending',
  stellar_tx_hash: null,
  rejection_reason: null,
  expires_at: '2026-12-31T00:00:00.000Z',
  executed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  signers: [
    {
      address: 'G' + 'A'.repeat(55),
      role: 'Admin',
      signed: true,
      signed_at: '2026-01-01T12:00:00.000Z',
    },
    {
      address: 'G' + 'C'.repeat(55),
      role: 'Member',
      signed: false,
      signed_at: null,
    },
  ],
};

describe('MultiSigProposalDetail', () => {
  it('renders proposal details correctly', () => {
    render(<MultiSigProposalDetail request={mockRequest} />);

    expect(screen.getByText('Community Fund Disbursement')).toBeInTheDocument();
    expect(screen.getByText('Disburse funds for local project')).toBeInTheDocument();
    expect(screen.getByText('Payment')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 signatures')).toBeInTheDocument();
  });

  it('renders list of signers', () => {
    render(<MultiSigProposalDetail request={mockRequest} />);

    expect(screen.getByText('Signers (2)')).toBeInTheDocument();
    expect(screen.getByText('Signed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('handles approve action', async () => {
    const onApprove = jest.fn().mockResolvedValue(undefined);
    render(
      <MultiSigProposalDetail
        request={mockRequest}
        onApprove={onApprove}
        userAddress={'G' + 'C'.repeat(55)}
      />
    );

    const approveBtn = screen.getByRole('button', { name: /Approve & Sign/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledTimes(1);
    });
  });

  it('handles reject action with form input', async () => {
    const onReject = jest.fn().mockResolvedValue(undefined);
    render(<MultiSigProposalDetail request={mockRequest} onReject={onReject} />);

    const rejectBtn = screen.getByRole('button', { name: /^Reject$/i });
    fireEvent.click(rejectBtn);

    const input = screen.getByPlaceholderText(/Enter reason.../i);
    fireEvent.change(input, { target: { value: 'Invalid disbursement terms' } });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Rejection/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith('Invalid disbursement terms');
    });
  });

  it('handles execute action for approved proposal', async () => {
    const approvedRequest: MultiSigRequest = {
      ...mockRequest,
      status: 'approved',
      current_signatures: 3,
    };
    const onExecute = jest.fn().mockResolvedValue(undefined);

    render(<MultiSigProposalDetail request={approvedRequest} onExecute={onExecute} />);

    const executeBtn = screen.getByRole('button', { name: /Execute Proposal/i });
    fireEvent.click(executeBtn);

    const input = screen.getByPlaceholderText(/Enter Stellar TX Hash.../i);
    fireEvent.change(input, { target: { value: 'hash_xyz_123' } });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Execution/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledWith('hash_xyz_123');
    });
  });
});
