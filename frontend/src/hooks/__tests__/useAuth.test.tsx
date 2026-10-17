import { render, screen, act, renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from '../useAuth';
import { useWallet } from '../useWallet';
import { setUnauthorizedHandler } from '@/lib/api';

jest.mock('../useWallet');
jest.mock('@/lib/api', () => ({
  setUnauthorizedHandler: jest.fn(),
  setAuthToken: jest.fn(),
  api: {
    post: jest.fn(),
  },
}));

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockSetUnauthorizedHandler = setUnauthorizedHandler as jest.MockedFunction<
  typeof setUnauthorizedHandler
>;

const TEST_PUBLIC_KEY = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('useAuth & AuthProvider', () => {
  let registered401Handler: (() => void) | null = null;
  const mockConnect = jest.fn();
  const mockDisconnect = jest.fn();
  const mockAuthenticate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    registered401Handler = null;

    mockSetUnauthorizedHandler.mockImplementation((handler) => {
      registered401Handler = handler;
    });

    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
      connecting: false,
      error: null,
      network: 'TESTNET',
      networkPassphrase: 'Test SDF Network ; September 2015',
      expectedNetwork: 'TESTNET',
      isCorrectNetwork: true,
      networkMismatch: false,
      connect: mockConnect,
      disconnect: mockDisconnect,
      authenticate: mockAuthenticate,
    });
  });

  describe('useAuth hook boundary', () => {
    it('throws error when useAuth is called outside AuthProvider', () => {
      // Suppress console.error for expected React boundary error
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleError.mockRestore();
    });
  });

  describe('Interface & Return Shape (Issue #361)', () => {
    it('exposes { publicKey, address, isAuthenticated, login, logout }', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(result.current).toHaveProperty('publicKey');
      expect(result.current).toHaveProperty('address');
      expect(result.current).toHaveProperty('isAuthenticated');
      expect(result.current).toHaveProperty('login');
      expect(result.current).toHaveProperty('logout');
      expect(typeof result.current.login).toBe('function');
      expect(typeof result.current.logout).toBe('function');
    });
  });

  describe('Authentication State', () => {
    it('provides unauthenticated state by default when wallet is disconnected', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.publicKey).toBeNull();
      expect(result.current.address).toBeNull();
      expect(result.current.isReauthOpen).toBe(false);
    });

    it('provides authenticated state when wallet is connected with a public key', () => {
      mockUseWallet.mockReturnValue({
        publicKey: TEST_PUBLIC_KEY,
        connected: true,
        connecting: false,
        error: null,
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
        expectedNetwork: 'TESTNET',
        isCorrectNetwork: true,
        networkMismatch: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        authenticate: mockAuthenticate,
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.publicKey).toBe(TEST_PUBLIC_KEY);
      expect(result.current.address).toBe(TEST_PUBLIC_KEY);
    });

    it('reports loading when wallet is in connecting state', () => {
      mockUseWallet.mockReturnValue({
        publicKey: null,
        connected: false,
        connecting: true,
        error: null,
        network: null,
        networkPassphrase: null,
        expectedNetwork: 'TESTNET',
        isCorrectNetwork: true,
        networkMismatch: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        authenticate: mockAuthenticate,
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('Login & Logout', () => {
    it('delegates login() to wallet.connect()', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await act(async () => {
        await result.current.login();
      });

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('delegates logout() to wallet.disconnect() and closes reauth modal', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      act(() => {
        result.current.openReauthModal();
      });
      expect(result.current.isReauthOpen).toBe(true);

      act(() => {
        result.current.logout();
      });

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      expect(result.current.isReauthOpen).toBe(false);
    });
  });

  describe('401 Interception & Re-authentication Modal', () => {
    it('subscribes to 401 unauthorized handler on mount and unregisters on unmount', () => {
      const { unmount } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(mockSetUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function));

      unmount();

      expect(mockSetUnauthorizedHandler).toHaveBeenLastCalledWith(null);
    });

    it('opens re-authentication modal when 401 handler is triggered', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(result.current.isReauthOpen).toBe(false);

      act(() => {
        registered401Handler?.();
      });

      expect(result.current.isReauthOpen).toBe(true);
    });

    it('reauthenticate() signs challenge for active address and closes modal on success', async () => {
      mockUseWallet.mockReturnValue({
        publicKey: TEST_PUBLIC_KEY,
        connected: true,
        connecting: false,
        error: null,
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
        expectedNetwork: 'TESTNET',
        isCorrectNetwork: true,
        networkMismatch: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        authenticate: mockAuthenticate.mockResolvedValue(undefined),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      act(() => {
        result.current.openReauthModal();
      });
      expect(result.current.isReauthOpen).toBe(true);

      await act(async () => {
        await result.current.reauthenticate();
      });

      expect(mockAuthenticate).toHaveBeenCalledWith(TEST_PUBLIC_KEY);
      expect(result.current.isReauthOpen).toBe(false);
    });

    it('reauthenticate() connects wallet if no active address is available', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await act(async () => {
        await result.current.reauthenticate();
      });

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('surfaces error if reauthenticate() fails without exposing sensitive tokens', async () => {
      mockUseWallet.mockReturnValue({
        publicKey: TEST_PUBLIC_KEY,
        connected: true,
        connecting: false,
        error: null,
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
        expectedNetwork: 'TESTNET',
        isCorrectNetwork: true,
        networkMismatch: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        authenticate: mockAuthenticate.mockRejectedValue(
          new Error('Freighter user declined signature')
        ),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await act(async () => {
        try {
          await result.current.reauthenticate();
        } catch {
          // Expected rejection
        }
      });

      expect(result.current.error).toBe('Freighter user declined signature');
      expect(result.current.error).not.toMatch(/Bearer\s+/);
      expect(result.current.error).not.toMatch(/S[A-Z0-9]{55}/);
    });
  });

  describe('AuthProvider Integration', () => {
    it('provides shared authentication context when wrapped in AuthProvider', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.publicKey).toBeNull();
      expect(result.current.address).toBeNull();
    });

    it('supports custom value override in AuthProvider for component testing', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => (
          <AuthProvider
            value={{
              publicKey: 'GCUSTOM_TEST_KEY',
              address: 'GCUSTOM_TEST_KEY',
              isAuthenticated: true,
            }}
          >
            {children}
          </AuthProvider>
        ),
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.publicKey).toBe('GCUSTOM_TEST_KEY');
      expect(result.current.address).toBe('GCUSTOM_TEST_KEY');
    });
  });

  describe('Security & Secrets Hygiene', () => {
    it('does not expose private keys, secrets, or bearer tokens in error states', () => {
      mockUseWallet.mockReturnValue({
        publicKey: null,
        connected: false,
        connecting: false,
        error: 'Freighter signature declined',
        network: null,
        networkPassphrase: null,
        expectedNetwork: 'TESTNET',
        isCorrectNetwork: true,
        networkMismatch: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        authenticate: mockAuthenticate,
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(result.current.error).toBe('Freighter signature declined');
      expect(result.current.error).not.toMatch(/S[A-Z0-9]{55}/);
      expect(result.current.error).not.toMatch(/Bearer\s+/);
    });
  });

  describe('Integrated UI', () => {
    it('renders children and mounts ReauthModal inside AuthProvider', () => {
      render(
        <AuthProvider>
          <div data-testid="child-content">App Child</div>
        </AuthProvider>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      // ReauthModal is mounted but closed by default
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Trigger 401
      act(() => {
        registered401Handler?.();
      });

      // Dialog is now displayed
      expect(screen.getByRole('dialog', { name: 'Session Expired' })).toBeInTheDocument();
    });
  });
});
