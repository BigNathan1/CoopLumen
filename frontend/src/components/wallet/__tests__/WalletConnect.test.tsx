import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const freighter = {
  isConnected: jest.fn(),
  setAllowed: jest.fn(),
  getPublicKey: jest.fn(),
  getNetworkDetails: jest.fn(),
  signMessage: jest.fn(),
};

jest.mock('@stellar/freighter-api', () => freighter);

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn() },
  setAuthToken: jest.fn(),
}));

jest.mock('@/hooks/useBalances');

import { WalletConnect } from '../WalletConnect';
import { useBalances } from '@/hooks/useBalances';
import { api, setAuthToken } from '@/lib/api';

const mockUseBalances = useBalances as jest.Mock;
const mockApiPost = api.post as jest.Mock;
const mockSetAuthToken = setAuthToken as jest.Mock;

const PUBLIC_KEY = 'G' + 'A'.repeat(55);

function setupFreighter(network = 'TESTNET') {
  freighter.isConnected.mockResolvedValue(true);
  freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
  freighter.getNetworkDetails.mockResolvedValue({
    network,
    networkPassphrase: `${network} passphrase`,
  });
  freighter.signMessage.mockResolvedValue('signed-challenge');
  mockApiPost.mockImplementation((path: string) => {
    if (path.endsWith('/challenge')) return Promise.resolve({ challenge: 'challenge' });
    return Promise.resolve({ token: 'session-token' });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseBalances.mockReturnValue({ data: undefined, error: undefined, isLoading: false });
});

describe('WalletConnect', () => {
  it('shows an accessible connect control while disconnected', () => {
    render(<WalletConnect />);

    const button = screen.getByRole('button', { name: 'Connect Freighter' });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('connects through Freighter, authenticates the account, and renders wallet details', async () => {
    setupFreighter();
    const user = userEvent.setup();
    render(<WalletConnect />);

    await user.click(screen.getByRole('button', { name: 'Connect Freighter' }));

    expect(freighter.isConnected).toHaveBeenCalledTimes(1);
    expect(freighter.getPublicKey).toHaveBeenCalledTimes(1);
    expect(freighter.getNetworkDetails).toHaveBeenCalledTimes(1);
    expect(freighter.signMessage).toHaveBeenCalledWith('challenge', {
      address: PUBLIC_KEY,
      accountToSign: PUBLIC_KEY,
    });
    expect(mockApiPost).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auth/challenge',
      { address: PUBLIC_KEY },
      { auth: false }
    );
    expect(mockApiPost).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/verify',
      { address: PUBLIC_KEY, challenge: 'challenge', signature: 'signed-challenge' },
      { auth: false }
    );
    expect(mockSetAuthToken).toHaveBeenCalledWith('session-token');

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('GAAAAA…AAAA')).toBeInTheDocument();
    expect(screen.getByText('TESTNET')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('shows the XLM balance and network warning for a connected wallet', async () => {
    setupFreighter('PUBLIC');
    mockUseBalances.mockReturnValue({
      data: [{ asset_type: 'native', balance: '123.4500000' }],
      error: undefined,
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<WalletConnect />);

    await user.click(screen.getByRole('button', { name: 'Connect Freighter' }));

    expect(screen.getByText('123.45 XLM')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Freighter is connected to PUBLIC, but this app expects TESTNET.'
    );
  });

  it('announces the loading state while Freighter is connecting', async () => {
    setupFreighter();
    let resolveConnection: (value: boolean) => void = () => undefined;
    freighter.isConnected.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConnection = resolve;
      })
    );
    const user = userEvent.setup();
    render(<WalletConnect />);

    await user.click(screen.getByRole('button', { name: 'Connect Freighter' }));

    const button = screen.getByRole('button', { name: /Connect Freighter/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Connecting to Freighter')).toBeInTheDocument();

    await act(async () => {
      resolveConnection(true);
    });
  });

  it('announces a Freighter connection error and leaves the wallet disconnected', async () => {
    freighter.isConnected.mockResolvedValue(false);
    freighter.setAllowed.mockRejectedValue(new Error('User rejected access'));
    const user = userEvent.setup();
    render(<WalletConnect />);

    await user.click(screen.getByRole('button', { name: 'Connect Freighter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('User rejected access');
    expect(screen.getByRole('button', { name: 'Connect Freighter' })).toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  });

  it('disconnects the wallet and clears the session token', async () => {
    setupFreighter();
    const user = userEvent.setup();
    render(<WalletConnect />);

    await user.click(screen.getByRole('button', { name: 'Connect Freighter' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Connect Freighter' })).toBeInTheDocument();
    });
    expect(mockSetAuthToken).toHaveBeenLastCalledWith(null);
  });
});
