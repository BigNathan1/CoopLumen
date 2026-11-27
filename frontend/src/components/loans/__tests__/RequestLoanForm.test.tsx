import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestLoanForm } from '../RequestLoanForm';
import type { Community } from '@/hooks/useCommunities';
import * as hook from '@/hooks/useCreateLoan';
import * as walletHook from '@/hooks/useWallet';

const borrower = 'G' + 'B'.repeat(55);

const community: Community = {
  id: 'community-1',
  name: 'EcoDAO',
  description: null,
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  issuer_public_key: 'G' + 'A'.repeat(55),
  created_at: '2026-01-01T00:00:00.000Z',
};

function mockCreateLoan(createLoan: jest.Mock) {
  jest.spyOn(hook, 'useCreateLoan').mockReturnValue({
    createLoan,
    submitting: false,
    error: null,
  });
}

function mockWallet(overrides: Partial<ReturnType<typeof walletHook.useWallet>> = {}) {
  jest.spyOn(walletHook, 'useWallet').mockReturnValue({
    publicKey: borrower,
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

async function selectCommunity() {
  const combobox = screen.getByRole('combobox');
  await userEvent.click(combobox);
  const option = screen.getByRole('option', { name: 'EcoDAO (ECO)' });
  await userEvent.click(option);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('RequestLoanForm', () => {
  it('keeps submit disabled until the form is valid', async () => {
    mockCreateLoan(jest.fn());
    mockWallet();
    render(<RequestLoanForm communities={[community]} />);

    const submit = screen.getByRole('button', { name: 'Request loan' });
    expect(submit).toBeDisabled();

    await selectCommunity();
    await userEvent.type(screen.getByPlaceholderText('0.00'), '50');

    expect(submit).toBeEnabled();
  });

  it('shows wallet connection prompt when not connected', () => {
    mockCreateLoan(jest.fn());
    mockWallet({ connected: false, publicKey: null });
    render(<RequestLoanForm communities={[community]} />);

    expect(screen.getByText(/Connect your wallet to request a loan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request loan' })).toBeDisabled();
  });

  it('validates amount is positive', async () => {
    mockCreateLoan(jest.fn());
    mockWallet();
    render(<RequestLoanForm communities={[community]} />);

    await selectCommunity();
    await userEvent.type(screen.getByPlaceholderText('0.00'), '-10');

    expect(screen.getByRole('button', { name: 'Request loan' })).toBeDisabled();
    expect(screen.getByText('Enter a positive amount')).toBeInTheDocument();
  });

  it('validates due date is not in the past', async () => {
    mockCreateLoan(jest.fn());
    mockWallet();
    render(<RequestLoanForm communities={[community]} />);

    await selectCommunity();
    await userEvent.type(screen.getByPlaceholderText('0.00'), '50');
    const dueDateInput = screen.getByLabelText('Due date (optional)');
    // Try to set a past date (the min attribute should prevent this in real browsers,
    // but we test the validation logic directly)
    await userEvent.type(dueDateInput, '2020-01-01');

    expect(screen.getByRole('button', { name: 'Request loan' })).toBeDisabled();
    expect(screen.getByText('Due date must be in the future')).toBeInTheDocument();
  });

  it('submits the loan with the community asset and connected borrower', async () => {
    const createLoan = jest.fn().mockResolvedValue({ id: 'loan-1' });
    mockCreateLoan(createLoan);
    mockWallet();
    render(<RequestLoanForm communities={[community]} />);

    await selectCommunity();
    await userEvent.type(screen.getByPlaceholderText('0.00'), '50');
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Seed funding');
    await userEvent.click(screen.getByRole('button', { name: 'Request loan' }));

    expect(createLoan).toHaveBeenCalledWith({
      communityId: 'community-1',
      borrowerAddress: borrower,
      lenderAddress: borrower,
      amount: '50',
      assetCode: 'ECO',
      assetIssuer: community.asset_issuer,
      purpose: 'Seed funding',
      dueAt: undefined,
      interestRate: 0,
    });
  });

  it('includes the due date when provided', async () => {
    const createLoan = jest.fn().mockResolvedValue({ id: 'loan-1' });
    mockCreateLoan(createLoan);
    mockWallet();
    render(<RequestLoanForm communities={[community]} />);

    await selectCommunity();
    await userEvent.type(screen.getByPlaceholderText('0.00'), '100');
    const dueDateInput = screen.getByLabelText('Due date (optional)');
    await userEvent.type(dueDateInput, '2026-12-31');
    await userEvent.click(screen.getByRole('button', { name: 'Request loan' }));

    expect(createLoan).toHaveBeenCalledWith(
      expect.objectContaining({
        dueAt: '2026-12-31T00:00:00.000Z',
      })
    );
  });

  it('shows success message after submission', async () => {
    const createLoan = jest.fn().mockResolvedValue({ id: 'loan-1' });
    mockCreateLoan(createLoan);
    mockWallet();
    render(<RequestLoanForm communities={[community]} />);

    await selectCommunity();
    await userEvent.type(screen.getByPlaceholderText('0.00'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Request loan' }));

    expect(screen.getByText('Loan requested and awaiting a lender.')).toBeInTheDocument();
  });

  it('resets form after successful submission', async () => {
    const createLoan = jest.fn().mockResolvedValue({ id: 'loan-1' });
    mockCreateLoan(createLoan);
    mockWallet();
    render(<RequestLoanForm communities={[community]} />);

    await selectCommunity();
    await userEvent.type(screen.getByPlaceholderText('0.00'), '50');
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Request loan' }));

    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByPlaceholderText('0.00')).toHaveValue('');
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('');
  });
});
