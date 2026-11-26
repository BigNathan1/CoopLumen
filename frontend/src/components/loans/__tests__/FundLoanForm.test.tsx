import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FundLoanForm } from '../FundLoanForm';
import type { Loan, LoanStatus } from '@/hooks/useLoans';
import * as walletHook from '@/hooks/useWallet';
import * as loanActionsHook from '@/hooks/useLoanActions';

const lender = 'G' + 'A'.repeat(55);
const borrower = 'G' + 'B'.repeat(55);

const baseLoan: Loan = {
  id: 'loan-1',
  community_id: 'community-1',
  borrower_address: borrower,
  lender_address: lender,
  amount: '100.0000000',
  amount_repaid: '0',
  interest_rate: '0',
  total_due: '100.0000000',
  outstanding: '100.0000000',
  asset_code: 'ECO',
  asset_issuer: null,
  purpose: 'Seed capital',
  status: 'pending',
  due_at: null,
  disbursed_at: null,
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function mockWallet(overrides: Partial<ReturnType<typeof walletHook.useWallet>> = {}) {
  jest.spyOn(walletHook, 'useWallet').mockReturnValue({
    publicKey: lender,
    connected: true,
    connecting: false,
    error: null,
    network: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
    expectedNetwork: 'TESTNET',
    isCorrectNetwork: true,
    networkMismatch: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    authenticate: jest.fn(),
    ...overrides,
  });
}

function mockLoanActions(overrides: Partial<ReturnType<typeof loanActionsHook.useLoanActions>> = {}) {
  jest.spyOn(loanActionsHook, 'useLoanActions').mockReturnValue({
    disburse: jest.fn().mockResolvedValue({ ...baseLoan, status: 'active' }),
    pending: false,
    error: null,
    ...overrides,
  } as ReturnType<typeof loanActionsHook.useLoanActions>);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FundLoanForm', () => {
  it('shows wallet connection prompt when not connected', () => {
    mockWallet({ connected: false, publicKey: null });
    mockLoanActions();
    render(<FundLoanForm loan={baseLoan} />);

    expect(screen.getByText(/Connect your wallet to fund this loan/)).toBeInTheDocument();
  });

  it('shows error when not the lender', () => {
    mockWallet({ publicKey: borrower });
    mockLoanActions();
    render(<FundLoanForm loan={baseLoan} />);

    expect(screen.getByText(/Only the lender can fund this loan/)).toBeInTheDocument();
  });

  it('shows error when loan status is not pending', () => {
    mockWallet();
    mockLoanActions();
    const activeLoan: Loan = { ...baseLoan, status: 'active' as LoanStatus };
    render(<FundLoanForm loan={activeLoan} />);

    expect(screen.getByText(/This loan cannot be funded/)).toBeInTheDocument();
  });

  it('renders loan summary with amount and borrower', () => {
    mockWallet();
    mockLoanActions();
    render(<FundLoanForm loan={baseLoan} />);

    expect(screen.getByText('Fund Loan')).toBeInTheDocument();
    expect(screen.getByText(/100.00/)).toBeInTheDocument();
    expect(screen.getByText('ECO')).toBeInTheDocument();
    expect(screen.getByText(/GBBBBB/)).toBeInTheDocument();
    expect(screen.getByText(/BBBB/)).toBeInTheDocument();
  });

  it('renders transaction hash and note fields', () => {
    mockWallet();
    mockLoanActions();
    render(<FundLoanForm loan={baseLoan} />);

    expect(screen.getByLabelText('Stellar transaction hash (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Note (optional)')).toBeInTheDocument();
  });

  it('submits with tx hash and note', async () => {
    const disburse = jest.fn().mockResolvedValue({ ...baseLoan, status: 'active' });
    mockWallet();
    mockLoanActions({ disburse });
    render(<FundLoanForm loan={baseLoan} />);

    await userEvent.type(screen.getByLabelText('Stellar transaction hash (optional)'), 'tx123');
    await userEvent.type(screen.getByLabelText('Note (optional)'), 'Funding note');
    await userEvent.click(screen.getByRole('button', { name: 'Fund loan' }));

    expect(disburse).toHaveBeenCalledWith({ stellarTxHash: 'tx123', note: 'Funding note' });
  });

  it('submits without optional fields', async () => {
    const disburse = jest.fn().mockResolvedValue({ ...baseLoan, status: 'active' });
    mockWallet();
    mockLoanActions({ disburse });
    render(<FundLoanForm loan={baseLoan} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fund loan' }));

    expect(disburse).toHaveBeenCalledWith({ stellarTxHash: undefined, note: undefined });
  });

  it('shows success message after funding', async () => {
    const disburse = jest.fn().mockResolvedValue({ ...baseLoan, status: 'active' });
    mockWallet();
    mockLoanActions({ disburse });
    render(<FundLoanForm loan={baseLoan} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fund loan' }));

    expect(screen.getByText('Loan funded and now active.')).toBeInTheDocument();
  });

  it('shows loading state while disbursing', async () => {
    const disbursePromise = new Promise<Loan>((resolve) => { setTimeout(resolve, 100); });
    const disburse = jest.fn().mockReturnValue(disbursePromise);
    mockWallet();
    mockLoanActions({ disburse, pending: true });
    render(<FundLoanForm loan={baseLoan} />);

    const button = screen.getByRole('button', { name: /Funding/ });
    expect(button).toBeDisabled();
  });

  it('shows error from hook', () => {
    mockWallet();
    mockLoanActions({ error: 'Failed to fund' });
    render(<FundLoanForm loan={baseLoan} />);

    expect(screen.getByText('Failed to fund')).toBeInTheDocument();
  });
});