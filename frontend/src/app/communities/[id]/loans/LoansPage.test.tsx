import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoansPage } from './LoansPage';
import { useCommunity } from '@/hooks/useCommunities';
import { useLoans } from '@/hooks/useLoans';
import { useWallet } from '@/hooks/useWallet';
import { Modal } from '@/components/ui/Modal';

// Mock hooks
jest.mock('@/hooks/useCommunities');
jest.mock('@/hooks/useLoans');
jest.mock('@/hooks/useWallet');

const mockUseCommunity = useCommunity as jest.MockedFunction<typeof useCommunity>;
const mockUseLoans = useLoans as jest.MockedFunction<typeof useLoans>;
const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

// Mock Modal to render children directly
jest.mock('@/components/ui/Modal', () => ({
  Modal: ({ isOpen, children, onClose, title, description }: any) =>
    isOpen ? (
      <div role="dialog" aria-labelledby="modal-title" aria-describedby="modal-desc">
        <h2 id="modal-title">{title}</h2>
        <p id="modal-desc">{description}</p>
        <button onClick={onClose} aria-label="Close">
          ×
        </button>
        {children}
      </div>
    ) : null,
}));

const mockCommunity = {
  id: 'test-community-id',
  name: 'Test Community',
  description: 'A test community',
  asset_code: 'TEST',
  asset_issuer: 'GTESTISSUER12345678901234567890123456789012345',
  issuer_public_key: 'GTESTISSUER12345678901234567890123456789012345',
  created_at: '2024-01-01T00:00:00Z',
};

const mockLoans = [
  {
    id: 'loan-1',
    community_id: 'test-community-id',
    borrower_address: 'GBORROWER12345678901234567890123456789012345',
    lender_address: 'GLENDER123456789012345678901234567890123456',
    amount: '1000.0000000',
    amount_repaid: '0',
    interest_rate: '5.00',
    asset_code: 'TEST',
    asset_issuer: 'GTESTISSUER12345678901234567890123456789012345',
    purpose: 'Test loan',
    status: 'pending' as const,
    due_at: '2024-12-31T23:59:59Z',
    disbursed_at: null,
    closed_at: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    total_due: '1050.0000000',
    outstanding: '1050.0000000',
  },
  {
    id: 'loan-2',
    community_id: 'test-community-id',
    borrower_address: 'GBORROWER222222222222222222222222222222222222',
    lender_address: 'GLENDER123456789012345678901234567890123456',
    amount: '500.0000000',
    amount_repaid: '500.0000000',
    interest_rate: '0',
    asset_code: 'TEST',
    asset_issuer: 'GTESTISSUER12345678901234567890123456789012345',
    purpose: 'Emergency fund',
    status: 'repaid' as const,
    due_at: '2024-06-30T23:59:59Z',
    disbursed_at: '2024-02-01T10:00:00Z',
    closed_at: '2024-06-15T10:00:00Z',
    created_at: '2024-01-20T10:00:00Z',
    updated_at: '2024-06-15T10:00:00Z',
    total_due: '500.0000000',
    outstanding: '0.0000000',
  },
];

describe('LoansPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseCommunity.mockReturnValue({
      data: mockCommunity,
      error: null,
      isLoading: false,
    });

    mockUseLoans.mockReturnValue({
      data: mockLoans,
      error: null,
      isLoading: false,
    });

    mockUseWallet.mockReturnValue({
      publicKey: 'GBORROWER12345678901234567890123456789012345',
      isConnected: true,
    });
  });

  it('renders community name and back link', () => {
    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByText('Test Community')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Test Community/i })).toBeInTheDocument();
  });

  it('shows loading state when community is loading', () => {
    mockUseCommunity.mockReturnValue({
      data: null,
      error: null,
      isLoading: true,
    });

    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByRole('status', { name: /Loading community/i })).toBeInTheDocument();
  });

  it('shows error when community fetch fails', () => {
    mockUseCommunity.mockReturnValue({
      data: null,
      error: new Error('Not found'),
      isLoading: false,
    });

    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Community not found/i)).toBeInTheDocument();
  });

  it('renders loans table with correct columns', () => {
    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByRole('table', { name: /Test Community loans/i })).toBeInTheDocument();
    expect(screen.getByText('Borrower')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Total Due')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Interest')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('displays loan rows with correct data', () => {
    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByText('GBORROWER…345')).toBeInTheDocument();
    expect(screen.getByText('1,000 TEST')).toBeInTheDocument();
    expect(screen.getByText('1,050 TEST')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('5.00%')).toBeInTheDocument();
  });

  it('shows Request Loan button for connected user', () => {
    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByRole('button', { name: /Request Loan/i })).toBeInTheDocument();
  });

  it('opens request loan modal when button clicked', async () => {
    const user = userEvent.setup();
    render(<LoansPage communityId="test-community-id" />);

    await user.click(screen.getByRole('button', { name: /Request Loan/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Purpose/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Interest Rate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Due Date/i)).toBeInTheDocument();
  });

  it('shows Repay button for active loan where user is borrower', () => {
    render(<LoansPage communityId="test-community-id" />);

    // First loan is pending, borrower is the current user
    // Second loan is repaid, borrower is different
    expect(screen.getByRole('button', { name: /Repay/i })).toBeInTheDocument();
  });

  it('opens repay modal when Repay clicked', async () => {
    const user = userEvent.setup();
    render(<LoansPage communityId="test-community-id" />);

    await user.click(screen.getByRole('button', { name: /Repay/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByText(/Outstanding:/i)).toBeInTheDocument();
  });

  it('displays status badges with correct variants', () => {
    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Repaid')).toBeInTheDocument();
  });

  it('shows empty state when no loans', () => {
    mockUseLoans.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
    });

    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByText('No loans yet')).toBeInTheDocument();
  });

  it('shows loading skeleton when loans loading', () => {
    mockUseLoans.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
    });

    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByRole('status', { name: /Loading loans/i })).toBeInTheDocument();
  });

  it('shows error alert when loans fetch fails', () => {
    mockUseLoans.mockReturnValue({
      data: undefined,
      error: new Error('Failed to load'),
      isLoading: false,
    });

    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Could not load loans/i)).toBeInTheDocument();
  });

  it('does not show Request Loan button when wallet not connected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      isConnected: false,
    });

    render(<LoansPage communityId="test-community-id" />);

    expect(screen.queryByRole('button', { name: /Request Loan/i })).not.toBeInTheDocument();
  });

  it('formats amounts with commas and asset code', () => {
    const largeLoan = [
      {
        ...mockLoans[0],
        id: 'loan-3',
        amount: '1000000.0000000',
        total_due: '1050000.0000000',
        outstanding: '1050000.0000000',
      },
    ];

    mockUseLoans.mockReturnValue({
      data: largeLoan,
      error: null,
      isLoading: false,
    });

    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByText('1,000,000 TEST')).toBeInTheDocument();
    expect(screen.getByText('1,050,000 TEST')).toBeInTheDocument();
  });

  it('shows due date in locale format', () => {
    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByText(/Dec 31, 2024/)).toBeInTheDocument();
  });

  it('shows — for loans without due date', () => {
    const loanNoDue = [
      {
        ...mockLoans[0],
        id: 'loan-4',
        due_at: null,
      },
    ];

    mockUseLoans.mockReturnValue({
      data: loanNoDue,
      error: null,
      isLoading: false,
    });

    render(<LoansPage communityId="test-community-id" />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
