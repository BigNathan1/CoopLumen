import { renderHook, act } from '@testing-library/react';
import { useAuth, AuthProvider } from '../useAuth';
import { useWallet } from '../useWallet';

jest.mock('../useWallet');

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

const TEST_PUBLIC_KEY = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('useAuth() hook', () => {
  const mockConnect = jest.fn();
  const mockDisconnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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
    });
  });

  describe('Interface & Return Shape (Issue #361)', () => {
    it('exposes { publicKey, isAuthenticated, login, logout }', () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current).toHaveProperty('publicKey');
      expect(result.current).toHaveProperty('isAuthenticated');
      expect(result.current).toHaveProperty('login');
      expect(result.current).toHaveProperty('logout');
      expect(typeof result.current.login).toBe('function');
      expect(typeof result.current.logout).toBe('function');
    });
  });

  describe('Unauthorized Path (Disconnected)', () => {
    it('returns isAuthenticated=false and publicKey=null when not connected', () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.publicKey).toBeNull();
      expect(result.current.isLoading).toBe(false);
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
      });

      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('Authorized Path (Connected)', () => {
    it('returns isAuthenticated=true and publicKey when wallet is connected', () => {
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
      });

      const { result } = renderHook(() => useAuth());

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.publicKey).toBe(TEST_PUBLIC_KEY);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Actions (login & logout)', () => {
    it('delegates login() to wallet.connect()', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login();
      });

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('delegates logout() to wallet.disconnect()', () => {
      const { result } = renderHook(() => useAuth());

      act(() => {
        result.current.logout();
      });

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('AuthProvider Integration', () => {
    it('provides shared authentication context when wrapped in AuthProvider', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.publicKey).toBeNull();
    });

    it('supports custom value override in AuthProvider for component testing', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => (
          <AuthProvider
            value={{
              publicKey: 'GCUSTOM_TEST_KEY',
              isAuthenticated: true,
            }}
          >
            {children}
          </AuthProvider>
        ),
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.publicKey).toBe('GCUSTOM_TEST_KEY');
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
      });

      const { result } = renderHook(() => useAuth());

      expect(result.current.error).toBe('Freighter signature declined');
      expect(result.current.error).not.toMatch(/S[A-Z0-9]{55}/);
      expect(result.current.error).not.toMatch(/Bearer\s+/);
    });
  });
});
