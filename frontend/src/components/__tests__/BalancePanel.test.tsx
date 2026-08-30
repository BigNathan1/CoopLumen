import { render, screen, fireEvent } from '@testing-library/react';
import { BalancePanel } from '../BalancePanel';
import { useBalances } from '@/hooks/useBalances';

jest.mock('@/hooks/useBalances');

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
