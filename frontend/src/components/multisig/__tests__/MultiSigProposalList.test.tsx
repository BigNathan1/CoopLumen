import { render, screen, fireEvent } from '@testing-library/react';
import { MultiSigProposalList, MultiSigProposal } from '../MultiSigProposalList';

const MOCK_PROPOSALS: MultiSigProposal[] = [
  {
    id: 'prop-1',
    title: 'Disburse Community Grant',
    description: 'Grant payout to developer team',
    status: 'pending',
    amount: '500.0',
    assetCode: 'XLM',
    targetAddress: 'G' + 'A'.repeat(55),
    signaturesCount: 1,
    requiredSignatures: 2,
    createdAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'prop-2',
    title: 'Treasury Rebalance',
    description: 'Ready for execution',
    status: 'pending',
    amount: '1000.0',
    assetCode: 'USDC',
    targetAddress: 'G' + 'B'.repeat(55),
    signaturesCount: 2,
    requiredSignatures: 2,
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'prop-3',
    title: 'Marketing Disbursement',
    description: 'Completed payout',
    status: 'executed',
    amount: '250.0',
    assetCode: 'XLM',
    targetAddress: 'G' + 'C'.repeat(55),
    signaturesCount: 2,
    requiredSignatures: 2,
    createdAt: '2026-08-15T10:00:00.000Z',
  },
  {
    id: 'prop-4',
    title: 'Unapproved Payout',
    description: 'Rejected proposal',
    status: 'rejected',
    amount: '100.0',
    assetCode: 'XLM',
    targetAddress: 'G' + 'D'.repeat(55),
    signaturesCount: 0,
    requiredSignatures: 2,
    createdAt: '2026-08-10T10:00:00.000Z',
  },
];

describe('MultiSigProposalList', () => {
  it('renders tab list with status counts', () => {
    render(<MultiSigProposalList proposals={MOCK_PROPOSALS} />);

    expect(screen.getByTestId('tab-pending')).toHaveTextContent('Pending');
    expect(screen.getByTestId('tab-pending')).toHaveTextContent('2');

    expect(screen.getByTestId('tab-executed')).toHaveTextContent('Executed');
    expect(screen.getByTestId('tab-executed')).toHaveTextContent('1');

    expect(screen.getByTestId('tab-rejected')).toHaveTextContent('Rejected');
    expect(screen.getByTestId('tab-rejected')).toHaveTextContent('1');
  });

  it('defaults to Pending tab and displays pending proposals', () => {
    render(<MultiSigProposalList proposals={MOCK_PROPOSALS} />);

    expect(screen.getByText('Disburse Community Grant')).toBeInTheDocument();
    expect(screen.getByText('Treasury Rebalance')).toBeInTheDocument();
    expect(screen.queryByText('Marketing Disbursement')).not.toBeInTheDocument();
  });

  it('switches tabs when clicked', () => {
    render(<MultiSigProposalList proposals={MOCK_PROPOSALS} />);

    fireEvent.click(screen.getByTestId('tab-executed'));

    expect(screen.getByText('Marketing Disbursement')).toBeInTheDocument();
    expect(screen.queryByText('Disburse Community Grant')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-rejected'));

    expect(screen.getByText('Unapproved Payout')).toBeInTheDocument();
  });

  it('renders empty state when no proposals match active tab', () => {
    const pendingOnly = MOCK_PROPOSALS.filter((p) => p.status === 'pending');
    render(<MultiSigProposalList proposals={pendingOnly} />);

    fireEvent.click(screen.getByTestId('tab-executed'));

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'No executed multi-sig proposals found.'
    );
  });

  it('triggers onSign callback when Sign button is clicked', () => {
    const onSign = jest.fn();
    render(<MultiSigProposalList proposals={MOCK_PROPOSALS} onSign={onSign} />);

    const signBtn = screen.getByTestId('sign-btn-prop-1');
    fireEvent.click(signBtn);

    expect(onSign).toHaveBeenCalledWith('prop-1');
  });

  it('triggers onExecute callback when threshold is met and Execute button is clicked', () => {
    const onExecute = jest.fn();
    render(<MultiSigProposalList proposals={MOCK_PROPOSALS} onExecute={onExecute} />);

    const executeBtn = screen.getByTestId('execute-btn-prop-2');
    fireEvent.click(executeBtn);

    expect(onExecute).toHaveBeenCalledWith('prop-2');
  });

  it('triggers onReject callback when Reject button is clicked', () => {
    const onReject = jest.fn();
    render(<MultiSigProposalList proposals={MOCK_PROPOSALS} onReject={onReject} />);

    const rejectBtn = screen.getByTestId('reject-btn-prop-1');
    fireEvent.click(rejectBtn);

    expect(onReject).toHaveBeenCalledWith('prop-1');
  });

  it('supports keyboard navigation across tabs (ArrowRight, ArrowLeft)', () => {
    render(<MultiSigProposalList proposals={MOCK_PROPOSALS} />);

    const pendingTab = screen.getByTestId('tab-pending');
    pendingTab.focus();

    fireEvent.keyDown(pendingTab, { key: 'ArrowRight' });
    expect(screen.getByTestId('tab-executed')).toHaveAttribute('aria-selected', 'true');

    const executedTab = screen.getByTestId('tab-executed');
    fireEvent.keyDown(executedTab, { key: 'ArrowLeft' });
    expect(screen.getByTestId('tab-pending')).toHaveAttribute('aria-selected', 'true');
  });
});
