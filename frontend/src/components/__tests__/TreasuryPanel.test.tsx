import { render, screen, fireEvent } from '@testing-library/react';
import { TreasuryPanel } from '../TreasuryPanel';
import { useAccountDetails } from '@/hooks/useAccountDetails';

jest.mock('@/hooks/useAccountDetails');

const mockUseAccountDetails = useAccountDetails as jest.MockedFunction<typeof useAccountDetails>;

const PUBLIC_KEY = 'G' + 'A'.repeat(55);

describe('TreasuryPanel', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('announces a loading state through a polite status region', () => {
    mockUseAccountDetails.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useAccountDetails>);
    render(<TreasuryPanel publicKey={PUBLIC_KEY} />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading treasury…');
  });

  it('announces a failure through an alert role', () => {
    mockUseAccountDetails.mockReturnValue({
      data: undefined,
      error: new Error('network down'),
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useAccountDetails>);
    render(<TreasuryPanel publicKey={PUBLIC_KEY} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load treasury');
  });

  it('shows empty states when there are no balances or signers', () => {
    mockUseAccountDetails.mockReturnValue({
      data: { id: PUBLIC_KEY, account_id: PUBLIC_KEY, balances: [], signers: [], thresholds: {} },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useAccountDetails>);
    render(<TreasuryPanel publicKey={PUBLIC_KEY} />);

    expect(screen.getByText('No balances found')).toBeInTheDocument();
    expect(screen.getByText('No signers found')).toBeInTheDocument();
  });

  it('renders balances and signers from the account details', () => {
    mockUseAccountDetails.mockReturnValue({
      data: {
        id: PUBLIC_KEY,
        account_id: PUBLIC_KEY,
        balances: [
          { asset_type: 'native', balance: '100.0000000' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'ECO',
            asset_issuer: 'GISSUER',
            balance: '50.5',
          },
        ],
        signers: [
          { key: 'GSIGNERONE' + 'A'.repeat(46), weight: 10, type: 'ed25519_public_key' },
          { key: 'GSIGNERTWO' + 'B'.repeat(46), weight: 5, type: 'ed25519_public_key' },
        ],
        thresholds: { low_threshold: 1, med_threshold: 2, high_threshold: 3 },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useAccountDetails>);
    render(<TreasuryPanel publicKey={PUBLIC_KEY} />);

    expect(screen.getByRole('heading', { name: 'Treasury' })).toBeInTheDocument();
    expect(screen.getByText('XLM')).toBeInTheDocument();
    expect(screen.getByText('100.00')).toBeInTheDocument();
    expect(screen.getByText('ECO')).toBeInTheDocument();
    expect(screen.getByText('50.50')).toBeInTheDocument();
    expect(screen.getByText('weight 10')).toBeInTheDocument();
    expect(screen.getByText('weight 5')).toBeInTheDocument();
  });

  it('calls mutate when the refresh button is clicked', () => {
    const mutate = jest.fn();
    mockUseAccountDetails.mockReturnValue({
      data: {
        id: PUBLIC_KEY,
        account_id: PUBLIC_KEY,
        balances: [{ asset_type: 'native', balance: '1' }],
        signers: [],
        thresholds: {},
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate,
    } as unknown as ReturnType<typeof useAccountDetails>);
    render(<TreasuryPanel publicKey={PUBLIC_KEY} />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh treasury' }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button and updates its label while revalidating', () => {
    mockUseAccountDetails.mockReturnValue({
      data: {
        id: PUBLIC_KEY,
        account_id: PUBLIC_KEY,
        balances: [{ asset_type: 'native', balance: '1' }],
        signers: [],
        thresholds: {},
      },
      error: undefined,
      isLoading: false,
      isValidating: true,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useAccountDetails>);
    render(<TreasuryPanel publicKey={PUBLIC_KEY} />);

    const button = screen.getByRole('button', { name: 'Refreshing treasury…' });
    expect(button).toBeDisabled();
  });
});
