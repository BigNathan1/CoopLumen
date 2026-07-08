import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateLoanForm } from '../CreateLoanForm';
import type { Community } from '@/hooks/useCommunities';
import * as hook from '@/hooks/useCreateLoan';

const lender = 'G' + 'B'.repeat(55);
const borrower = 'G' + 'C'.repeat(55);

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

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CreateLoanForm', () => {
  it('keeps submit disabled until the form is valid', async () => {
    mockCreateLoan(jest.fn());
    render(<CreateLoanForm lenderAddress={lender} communities={[community]} />);

    const submit = screen.getByRole('button', { name: 'Create loan' });
    expect(submit).toBeDisabled();

    await userEvent.selectOptions(screen.getByRole('combobox'), 'community-1');
    await userEvent.type(screen.getByPlaceholderText('G…'), borrower);
    await userEvent.type(screen.getByPlaceholderText('0.00'), '50');

    expect(submit).toBeEnabled();
  });

  it('rejects a borrower equal to the lender', async () => {
    mockCreateLoan(jest.fn());
    render(<CreateLoanForm lenderAddress={lender} communities={[community]} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'community-1');
    await userEvent.type(screen.getByPlaceholderText('G…'), lender);
    await userEvent.type(screen.getByPlaceholderText('0.00'), '50');

    expect(screen.getByRole('button', { name: 'Create loan' })).toBeDisabled();
    expect(screen.getByText('Borrower and lender cannot be the same account')).toBeInTheDocument();
  });

  it('submits the loan with the community asset and connected lender', async () => {
    const createLoan = jest.fn().mockResolvedValue({ id: 'loan-1' });
    mockCreateLoan(createLoan);
    render(<CreateLoanForm lenderAddress={lender} communities={[community]} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'community-1');
    await userEvent.type(screen.getByPlaceholderText('G…'), borrower);
    await userEvent.type(screen.getByPlaceholderText('0.00'), '50');
    await userEvent.type(screen.getByPlaceholderText('What is this loan for?'), 'Seed');
    await userEvent.click(screen.getByRole('button', { name: 'Create loan' }));

    expect(createLoan).toHaveBeenCalledWith({
      communityId: 'community-1',
      borrowerAddress: borrower,
      lenderAddress: lender,
      amount: '50',
      assetCode: 'ECO',
      assetIssuer: community.asset_issuer,
      purpose: 'Seed',
    });
  });
});
