import { render, screen } from '@testing-library/react';
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
  });
});
