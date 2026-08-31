import { render, screen } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BalancePanel } from '../BalancePanel';
import { useBalances } from '@/hooks/useBalances';

jest.mock('@/hooks/useBalances');

const mockUseBalances = useBalances as jest.Mock;

describe('BalancePanel', () => {
  it('announces a loading state through a polite status region', () => {
    mockUseBalances.mockReturnValue({ data: undefined, error: undefined, isLoading: true });
    render(<BalancePanel publicKey="G".repeat(56) />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading balances…');
  });

  it('announces a failure through an alert role', () => {
    mockUseBalances.mockReturnValue({
      data: undefined,
      error: new Error('network down'),
      isLoading: false,
    });
    render(<BalancePanel publicKey="G".repeat(56) />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load balances');
  });

  it('shows an empty state when there are no balances', () => {
    mockUseBalances.mockReturnValue({ data: [], error: undefined, isLoading: false });
    render(<BalancePanel publicKey="G".repeat(56) />);

    expect(screen.getByText('No balances found')).toBeInTheDocument();
  });

  it('renders native XLM and custom asset balances', () => {
    mockUseBalances.mockReturnValue({
      data: [
        { asset_type: 'native', balance: '100.0000000' },
        { asset_type: 'credit_alphanum4', asset_code: 'ECO', asset_issuer: 'GISSUER', balance: '50.5' },
      ],
      error: undefined,
      isLoading: false,
    });
    render(<BalancePanel publicKey="G".repeat(56) />);

    expect(screen.getByText('XLM')).toBeInTheDocument();
    expect(screen.getByText('100.00')).toBeInTheDocument();
    expect(screen.getByText('ECO')).toBeInTheDocument();
    expect(screen.getByText('50.50')).toBeInTheDocument();
  });

  it('renders a heading identifying the panel', () => {
    mockUseBalances.mockReturnValue({
      data: [{ asset_type: 'native', balance: '1' }],
      error: undefined,
      isLoading: false,
    });
    render(<BalancePanel publicKey="G".repeat(56) />);

    expect(screen.getByRole('heading', { name: 'Your Balances' })).toBeInTheDocument();
const mockUseBalances = useBalances as jest.MockedFunction<typeof useBalances>;

const PUBLIC_KEY = 'G' + 'A'.repeat(55);

describe('BalancePanel', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders a loading state without a refresh button', () => {
    mockUseBalances.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useBalances>);

    render(<BalancePanel publicKey={PUBLIC_KEY} />);
    expect(screen.getByText('Loading balances…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders balances with an enabled refresh button', () => {
    mockUseBalances.mockReturnValue({
      data: [{ asset_type: 'native', balance: '100.5000000' }],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useBalances>);

    render(<BalancePanel publicKey={PUBLIC_KEY} />);
    expect(screen.getByText('XLM')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Refresh balances' });
    expect(button).toBeEnabled();
  });

  it('calls mutate when the refresh button is clicked', () => {
    const mutate = jest.fn();
    mockUseBalances.mockReturnValue({
      data: [{ asset_type: 'native', balance: '100.5000000' }],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate,
    } as unknown as ReturnType<typeof useBalances>);

    render(<BalancePanel publicKey={PUBLIC_KEY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh balances' }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button and updates its label while revalidating', () => {
    mockUseBalances.mockReturnValue({
      data: [{ asset_type: 'native', balance: '100.5000000' }],
      error: undefined,
      isLoading: false,
      isValidating: true,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useBalances>);

    render(<BalancePanel publicKey={PUBLIC_KEY} />);
    const button = screen.getByRole('button', { name: 'Refreshing balances…' });
    expect(button).toBeDisabled();
  });

  it('shows a refresh button alongside the error state', () => {
    const mutate = jest.fn();
    mockUseBalances.mockReturnValue({
      data: undefined,
      error: new Error('boom'),
      isLoading: false,
      isValidating: false,
      mutate,
    } as unknown as ReturnType<typeof useBalances>);

    render(<BalancePanel publicKey={PUBLIC_KEY} />);
    expect(screen.getByText('Failed to load balances')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Refresh balances' });
    fireEvent.click(button);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('shows a refresh button alongside the empty state', () => {
    mockUseBalances.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useBalances>);

    render(<BalancePanel publicKey={PUBLIC_KEY} />);
    expect(screen.getByText('No balances found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh balances' })).toBeInTheDocument();
  });
});
