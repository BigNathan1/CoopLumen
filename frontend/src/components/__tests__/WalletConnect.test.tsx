import { render, screen } from '@testing-library/react';
import { WalletConnect } from '../WalletConnect';
import { useWallet } from '@/hooks/useWallet';
import { useBalances } from '@/hooks/useBalances';

jest.mock('@/hooks/useWallet');
jest.mock('@/hooks/useBalances');

const mockUseWallet = useWallet as jest.Mock;
const mockUseBalances = useBalances as jest.Mock;

function baseWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  return {
    publicKey: null,
    connected: false,
    connecting: false,
    error: null,
    network: null,
    networkPassphrase: null,
    expectedNetwork: 'TESTNET',
    networkMismatch: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockUseBalances.mockReturnValue({ data: undefined, error: undefined, isLoading: false });
});

describe('WalletConnect', () => {
  it('shows a connect button when disconnected', () => {
    mockUseWallet.mockReturnValue(baseWallet());
    render(<WalletConnect />);

    expect(screen.getByRole('button', { name: 'Connect Freighter' })).toBeInTheDocument();
  });

  it('shows the shortened address and network once connected', () => {
    mockUseWallet.mockReturnValue(
      baseWallet({
        publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
        connected: true,
        network: 'TESTNET',
      })
    );
    render(<WalletConnect />);

    expect(screen.getByText('GABCDE…4567')).toBeInTheDocument();
    expect(screen.getByText('TESTNET')).toBeInTheDocument();
  });

  it('shows the XLM balance once loaded', () => {
    mockUseWallet.mockReturnValue(
      baseWallet({ publicKey: 'G'.repeat(56), connected: true, network: 'TESTNET' })
    );
    mockUseBalances.mockReturnValue({
      data: [{ asset_type: 'native', balance: '123.4500000' }],
      error: undefined,
      isLoading: false,
    });
    render(<WalletConnect />);

    expect(screen.getByText('123.45 XLM')).toBeInTheDocument();
  });

  it('shows a network mismatch warning when Freighter is on the wrong network', () => {
    mockUseWallet.mockReturnValue(
      baseWallet({
        publicKey: 'G'.repeat(56),
        connected: true,
        network: 'PUBLIC',
        networkMismatch: true,
      })
    );
    render(<WalletConnect />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does not show a network warning while on the expected network', () => {
    mockUseWallet.mockReturnValue(
      baseWallet({ publicKey: 'G'.repeat(56), connected: true, network: 'TESTNET' })
    );
    render(<WalletConnect />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls disconnect when the disconnect button is clicked', () => {
    const disconnect = jest.fn();
    mockUseWallet.mockReturnValue(
      baseWallet({ publicKey: 'G'.repeat(56), connected: true, network: 'TESTNET', disconnect })
    );
    render(<WalletConnect />);

    screen.getByRole('button', { name: 'Disconnect' }).click();
    expect(disconnect).toHaveBeenCalled();
  });

  it('renders an error message when connection fails', () => {
    mockUseWallet.mockReturnValue(baseWallet({ error: 'User rejected access' }));
    render(<WalletConnect />);

    expect(screen.getByText('User rejected access')).toBeInTheDocument();
  });
});
