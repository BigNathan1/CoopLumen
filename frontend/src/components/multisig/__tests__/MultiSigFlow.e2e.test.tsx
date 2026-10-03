import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MultiSigProposalDetail } from '../MultiSigProposalDetail';
import { MultiSigProposalList, MultiSigProposal } from '../../MultiSigProposalList';
import type { MultiSigRequest } from '../../../hooks/useMultiSig';

/**
 * End-to-End Simulation Component for Multi-Sig Propose, Co-Sign, and Execute Workflow
 */
function MultiSigWorkflowDashboard({
  initialRequests,
  currentUserAddress,
}: {
  initialRequests: MultiSigRequest[];
  currentUserAddress: string;
}) {
  const [requests, setRequests] = useState<MultiSigRequest[]>(initialRequests);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequests[0]?.id ?? null);

  const selectedRequest = requests.find((r) => r.id === selectedId);

  // Map MultiSigRequest to MultiSigProposal for list view
  const proposals: MultiSigProposal[] = requests.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    status: r.status === 'executed' ? 'executed' : r.status === 'rejected' ? 'rejected' : 'pending',
    amount: (r.payload.amount as string) ?? '0',
    assetCode: 'ECO',
    targetAddress: (r.payload.recipient as string) ?? 'G' + 'B'.repeat(55),
    signaturesCount: r.current_signatures,
    requiredSignatures: r.required_signatures,
    createdAt: r.created_at,
    creatorAddress: r.proposer_address,
  }));

  const handleApprove = async () => {
    if (!selectedId) return;
    setRequests((prev) =>
      prev.map((req) => {
        if (req.id !== selectedId) return req;
        const newSignatures = req.current_signatures + 1;
        const newStatus = newSignatures >= req.required_signatures ? 'approved' : 'pending';
        return {
          ...req,
          current_signatures: newSignatures,
          status: newStatus,
          signers: req.signers?.map((s) =>
            s.address === currentUserAddress
              ? { ...s, signed: true, signed_at: new Date().toISOString() }
              : s
          ),
        };
      })
    );
  };

  const handleReject = async (reason?: string) => {
    if (!selectedId) return;
    setRequests((prev) =>
      prev.map((req) =>
        req.id === selectedId
          ? {
              ...req,
              status: 'rejected',
              rejection_reason: reason ?? 'Rejected by co-signer',
            }
          : req
      )
    );
  };

  const handleExecute = async () => {
    if (!selectedId) return;
    setRequests((prev) =>
      prev.map((req) =>
        req.id === selectedId
          ? {
              ...req,
              status: 'executed',
              stellar_tx_hash: '3389e9f0f73b654dd0c09b3e933a29566e3716e0885b937657f6829496386fd2',
              executed_at: new Date().toISOString(),
            }
          : req
      )
    );
  };

  return (
    <div>
      <h1>Multi-Sig Governance Dashboard</h1>
      <MultiSigProposalList
        proposals={proposals}
        onSign={handleApprove}
        onExecute={handleExecute}
        onReject={handleReject}
      />
      {selectedRequest && (
        <MultiSigProposalDetail
          request={selectedRequest}
          userAddress={currentUserAddress}
          onApprove={handleApprove}
          onReject={handleReject}
          onExecute={handleExecute}
        />
      )}
    </div>
  );
}

describe('E2E: MultiSig Proposal -> Co-Sign -> Execute Flow (Issue #419 / #497)', () => {
  const proposer = 'GA' + '1'.repeat(54);
  const cosigner = 'GB' + '2'.repeat(54);

  const mockInitialRequest: MultiSigRequest = {
    id: 'prop-2026-001',
    community_id: 'comm-101',
    proposer_address: proposer,
    action: 'payment',
    title: 'Disburse Community Clean Water Grant',
    description: 'Release 500 ECO tokens for solar-powered water borehole',
    payload: {
      recipient: 'GC' + '3'.repeat(54),
      amount: '500.0000000',
    },
    transaction_xdr: 'AAAAAgAAAA...',
    required_signatures: 2,
    current_signatures: 1, // Proposer already signed
    status: 'pending',
    stellar_tx_hash: null,
    rejection_reason: null,
    expires_at: '2026-12-31T23:59:59.000Z',
    executed_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    signers: [
      { address: proposer, role: 'Treasurer', signed: true, signed_at: '2026-06-01T00:00:00.000Z' },
      { address: cosigner, role: 'Co-Signer', signed: false, signed_at: null },
    ],
  };

  it('allows a co-signer to review, co-sign, and execute a proposed multi-sig transaction', async () => {
    render(
      <MultiSigWorkflowDashboard
        initialRequests={[mockInitialRequest]}
        currentUserAddress={cosigner}
      />
    );

    // 1. Dashboard displays the pending proposal list and detail
    expect(screen.getAllByText('Disburse Community Clean Water Grant').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Release 500 ECO tokens for solar-powered water borehole').length
    ).toBeGreaterThan(0);
    expect(screen.getByText('1 of 2 signatures')).toBeInTheDocument();

    // 2. Co-signer sees the "Approve & Sign" action button in detail card
    const approveBtn = screen.getByRole('button', { name: /Approve & Sign/i });
    expect(approveBtn).toBeInTheDocument();

    // 3. Co-signer clicks Approve & Sign
    fireEvent.click(approveBtn);

    // 4. Threshold is reached (2 of 2) -> Status becomes APPROVED, Execute Proposal button appears
    await waitFor(() => {
      expect(screen.getByText('2 of 2 signatures')).toBeInTheDocument();
      expect(screen.getAllByText('APPROVED').length).toBeGreaterThan(0);
    });

    // 5. Co-signer initiates execution form
    const executeBtn = screen.getByRole('button', { name: /Execute Proposal/i });
    expect(executeBtn).toBeInTheDocument();
    fireEvent.click(executeBtn);

    // 6. Enters on-chain Stellar transaction hash and confirms
    const hashInput = screen.getByPlaceholderText(/Enter Stellar TX Hash.../i);
    fireEvent.change(hashInput, {
      target: { value: '3389e9f0f73b654dd0c09b3e933a29566e3716e0885b937657f6829496386fd2' },
    });
    const confirmExecuteBtn = screen.getByRole('button', { name: /Confirm Execution/i });
    fireEvent.click(confirmExecuteBtn);

    // 7. Transaction executes successfully and displays on-chain hash & EXECUTED status
    await waitFor(() => {
      expect(screen.getAllByText('EXECUTED').length).toBeGreaterThan(0);
      expect(
        screen.getByText(/3389e9f0f73b654dd0c09b3e933a29566e3716e0885b937657f6829496386fd2/i)
      ).toBeInTheDocument();
    });
  });

  it('allows a co-signer to reject a proposed multi-sig transaction with reason', async () => {
    render(
      <MultiSigWorkflowDashboard
        initialRequests={[mockInitialRequest]}
        currentUserAddress={cosigner}
      />
    );

    // 1. Co-signer clicks Reject on the proposal detail card
    const detailRejectBtns = screen.getAllByRole('button', { name: /^Reject$/i });
    // The detail reject button is the ghost/md one in the detail action toolbar
    fireEvent.click(detailRejectBtns[detailRejectBtns.length - 1]);

    // 2. Rejection dialog / input opens
    const reasonInput = screen.getByPlaceholderText(/Enter reason.../i);
    fireEvent.change(reasonInput, { target: { value: 'Budget exceeded allocation limit for Q2' } });

    // 3. Confirm rejection
    const confirmRejectBtn = screen.getByRole('button', { name: /Confirm Rejection/i });
    fireEvent.click(confirmRejectBtn);

    // 4. Status updates to REJECTED with rejection reason displayed
    await waitFor(() => {
      expect(screen.getAllByText('REJECTED').length).toBeGreaterThan(0);
      expect(screen.getByText('Budget exceeded allocation limit for Q2')).toBeInTheDocument();
    });
  });
});
