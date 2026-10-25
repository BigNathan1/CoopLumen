import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '../ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

jest.mock('@/hooks/useAuth');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('ProtectedRoute', () => {
  const mockReplace = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      replace: mockReplace,
      push: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      prefetch: jest.fn(),
      // Only the navigation methods matter here; the cast keeps the mock from
      // tracking every field Next adds to the router instance.
    } as unknown as ReturnType<typeof useRouter>);
  });

  describe('Loading State', () => {
    it('renders accessible loading skeleton while authentication is loading', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        address: null,
        publicKey: null,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        reauthenticate: jest.fn(),
        isReauthOpen: false,
        openReauthModal: jest.fn(),
        closeReauthModal: jest.fn(),
      });

      render(
        <ProtectedRoute>
          <div data-testid="protected-content">Secret Dashboard</div>
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-route-loading')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/Authenticating session/i)).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('renders custom fallback during loading when provided', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        address: null,
        publicKey: null,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        reauthenticate: jest.fn(),
        isReauthOpen: false,
        openReauthModal: jest.fn(),
        closeReauthModal: jest.fn(),
      });

      render(
        <ProtectedRoute fallback={<div data-testid="custom-spinner">Custom Loading</div>}>
          <div data-testid="protected-content">Secret Dashboard</div>
        </ProtectedRoute>
      );

      expect(screen.getByTestId('custom-spinner')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('Unauthorized Path (Access Denied / Redirect)', () => {
    it('redirects to "/" by default when user is not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        address: null,
        publicKey: null,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        reauthenticate: jest.fn(),
        isReauthOpen: false,
        openReauthModal: jest.fn(),
        closeReauthModal: jest.fn(),
      });

      render(
        <ProtectedRoute>
          <div data-testid="protected-content">Secret Dashboard</div>
        </ProtectedRoute>
      );

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('redirects to custom redirectTo path when specified', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        address: null,
        publicKey: null,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        reauthenticate: jest.fn(),
        isReauthOpen: false,
        openReauthModal: jest.fn(),
        closeReauthModal: jest.fn(),
      });

      render(
        <ProtectedRoute redirectTo="/login">
          <div data-testid="protected-content">Secret Dashboard</div>
        </ProtectedRoute>
      );

      expect(mockReplace).toHaveBeenCalledWith('/login');
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('does not leak tokens, private keys or secrets upon redirect', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        address: null,
        publicKey: null,
        error: 'Unauthorized attempt',
        login: jest.fn(),
        logout: jest.fn(),
        reauthenticate: jest.fn(),
        isReauthOpen: false,
        openReauthModal: jest.fn(),
        closeReauthModal: jest.fn(),
      });

      const { container } = render(
        <ProtectedRoute>
          <div data-testid="protected-content">Secret Dashboard</div>
        </ProtectedRoute>
      );

      expect(container.textContent).not.toMatch(/Bearer\s+/);
      expect(container.textContent).not.toMatch(/S[A-Z0-9]{55}/);
    });
  });

  describe('Authorized Path (Access Granted)', () => {
    it('renders protected children when authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        address: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        publicKey: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        reauthenticate: jest.fn(),
        isReauthOpen: false,
        openReauthModal: jest.fn(),
        closeReauthModal: jest.fn(),
      });

      render(
        <ProtectedRoute>
          <div data-testid="protected-content">Welcome to Protected Treasury</div>
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.getByText('Welcome to Protected Treasury')).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.queryByTestId('protected-route-loading')).not.toBeInTheDocument();
    });
  });
});
