import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletConnect } from '../WalletConnect';
import { useWallet } from '@/hooks/useWallet';

jest.mock('@/hooks/useWallet');

const mockUseWallet = useWallet as jest.Mock;

const PUBLIC_KEY = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEFXXXX';

function mockWalletState(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  mockUseWallet.mockReturnValue({
    publicKey: null,
    connected: false,
    connecting: false,
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  });
}

describe('WalletConnect', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('when disconnected', () => {
    it('renders a connect button', () => {
      mockWalletState();
      render(<WalletConnect />);

      expect(screen.getByRole('button', { name: 'Connect Freighter' })).toBeInTheDocument();
    });

    it('calls connect when the button is activated', async () => {
      const connect = jest.fn();
      mockWalletState({ connect });
      render(<WalletConnect />);

      await userEvent.click(screen.getByRole('button', { name: 'Connect Freighter' }));

      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('is reachable and operable by keyboard', async () => {
      const connect = jest.fn();
      mockWalletState({ connect });
      render(<WalletConnect />);

      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Connect Freighter' })).toHaveFocus();

      await userEvent.keyboard('{Enter}');
      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('disables the button and announces the wait while connecting', () => {
      mockWalletState({ connecting: true });
      render(<WalletConnect />);

      const button = screen.getByRole('button', { name: /Connect Freighter/ });
      expect(button).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent('Connecting to Freighter');
    });

    it('surfaces a connection error as an alert', () => {
      mockWalletState({ error: 'Freighter is not installed' });
      render(<WalletConnect />);

      expect(screen.getByRole('alert')).toHaveTextContent('Freighter is not installed');
    });

    it('does not show a disconnect button', () => {
      mockWalletState();
      render(<WalletConnect />);

      expect(screen.queryByRole('button', { name: /Disconnect/ })).not.toBeInTheDocument();
    });
  });

  describe('when connected', () => {
    it('shows the connected badge and a shortened public key', () => {
      mockWalletState({ connected: true, publicKey: PUBLIC_KEY });
      render(<WalletConnect />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByTitle(PUBLIC_KEY)).toHaveTextContent(
        `${PUBLIC_KEY.slice(0, 6)}…${PUBLIC_KEY.slice(-4)}`
      );
    });

    it('renders a disconnect button with an accessible name naming the account', () => {
      mockWalletState({ connected: true, publicKey: PUBLIC_KEY });
      render(<WalletConnect />);

      expect(
        screen.getByRole('button', { name: `Disconnect wallet ${PUBLIC_KEY}` })
      ).toBeInTheDocument();
    });

    it('calls disconnect when the disconnect button is activated', async () => {
      const disconnect = jest.fn();
      mockWalletState({ connected: true, publicKey: PUBLIC_KEY, disconnect });
      render(<WalletConnect />);

      await userEvent.click(screen.getByRole('button', { name: /Disconnect/ }));

      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('is reachable and operable by keyboard', async () => {
      const disconnect = jest.fn();
      mockWalletState({ connected: true, publicKey: PUBLIC_KEY, disconnect });
      render(<WalletConnect />);

      await userEvent.tab();
      expect(screen.getByRole('button', { name: /Disconnect/ })).toHaveFocus();

      await userEvent.keyboard('{Enter}');
      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('does not show a connect button', () => {
      mockWalletState({ connected: true, publicKey: PUBLIC_KEY });
      render(<WalletConnect />);

      expect(screen.queryByRole('button', { name: /Connect Freighter/ })).not.toBeInTheDocument();
    });
  });
});
