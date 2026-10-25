'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { setUnauthorizedHandler } from '@/lib/api';
import { ReauthModal } from '@/components/auth/ReauthModal';

export interface AuthContextType {
  /** Connected and authenticated Stellar public address, or null if disconnected */
  publicKey: string | null;
  /** The active authenticated Stellar public address, or null */
  address: string | null;
  /** True when the user is connected and holds an active authenticated session */
  isAuthenticated: boolean;
  /** True while connecting to the wallet or completing challenge re-authentication */
  isLoading: boolean;
  /** Current authentication or connection error, if any */
  error: string | null;
  /** Connects Freighter wallet and exchanges a signed challenge for a backend session */
  login: () => Promise<void>;
  /** Clears the session token and disconnects the active wallet */
  logout: () => void;
  /** Re-authenticates the current wallet address by signing a fresh challenge */
  reauthenticate: () => Promise<void>;
  /** Whether the re-authentication modal is currently open */
  isReauthOpen: boolean;
  /** Manually open the re-authentication modal */
  openReauthModal: () => void;
  /** Close the re-authentication modal */
  closeReauthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
  /** Optional initial authentication status override (primarily for test harnesses) */
  initialAuthenticated?: boolean;
  /** Optional initial address override (primarily for test harnesses) */
  initialAddress?: string | null;
  /** Optional value override for testing */
  value?: Partial<AuthContextType>;
}

/**
 * Global authentication provider wrapping the application root layout.
 *
 * Integrates with Freighter wallet connection and backend challenge-response
 * session tokens, automatically triggers re-authentication on 401 API responses,
 * and exposes authentication state via {@link useAuth}.
 */
export function AuthProvider({
  children,
  initialAuthenticated,
  initialAddress,
  value: overrideValue,
}: AuthProviderProps) {
  const wallet = useWallet();
  const [isReauthOpen, setIsReauthOpen] = useState(false);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const openReauthModal = useCallback(() => {
    setReauthError(null);
    setIsReauthOpen(true);
  }, []);

  const closeReauthModal = useCallback(() => {
    setIsReauthOpen(false);
    setReauthError(null);
  }, []);

  // Subscribe to 401 Unauthorized API responses
  useEffect(() => {
    setUnauthorizedHandler(() => {
      openReauthModal();
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [openReauthModal]);

  const reauthenticate = useCallback(async () => {
    setIsReauthenticating(true);
    setReauthError(null);
    try {
      const activeAddress = wallet.publicKey ?? initialAddress;
      if (!activeAddress) {
        await wallet.connect();
      } else {
        await (wallet as any).authenticate?.(activeAddress);
      }
      setIsReauthOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Re-authentication failed. Please try again.';
      setReauthError(message);
      throw err;
    } finally {
      setIsReauthenticating(false);
    }
  }, [wallet, initialAddress]);

  const login = useCallback(async () => {
    await wallet.connect();
  }, [wallet]);

  const logout = useCallback(() => {
    wallet.disconnect();
    closeReauthModal();
  }, [wallet, closeReauthModal]);

  const activeAddress = initialAddress !== undefined ? initialAddress : wallet.publicKey;
  const isAuthenticated =
    initialAuthenticated !== undefined
      ? initialAuthenticated
      : wallet.connected && Boolean(wallet.publicKey);

  const address = overrideValue?.address ?? overrideValue?.publicKey ?? activeAddress;
  const publicKey = overrideValue?.publicKey ?? overrideValue?.address ?? activeAddress;
  const isLoading =
    overrideValue?.isLoading !== undefined
      ? overrideValue.isLoading
      : wallet.connecting || isReauthenticating;
  const error =
    overrideValue?.error !== undefined ? overrideValue.error : (reauthError ?? wallet.error);
  const isAuth =
    overrideValue?.isAuthenticated !== undefined ? overrideValue.isAuthenticated : isAuthenticated;

  const contextValue: AuthContextType = {
    publicKey,
    address,
    isAuthenticated: isAuth,
    isLoading,
    error,
    login: overrideValue?.login ?? login,
    logout: overrideValue?.logout ?? logout,
    reauthenticate: overrideValue?.reauthenticate ?? reauthenticate,
    isReauthOpen: overrideValue?.isReauthOpen ?? isReauthOpen,
    openReauthModal: overrideValue?.openReauthModal ?? openReauthModal,
    closeReauthModal: overrideValue?.closeReauthModal ?? closeReauthModal,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      <ReauthModal
        isOpen={isReauthOpen}
        onClose={closeReauthModal}
        onReauthenticate={reauthenticate}
        isLoading={isReauthenticating}
        error={reauthError}
      />
    </AuthContext.Provider>
  );
}

/**
 * Access the global authentication context.
 * Returns `{ publicKey, address, isAuthenticated, login, logout, isLoading, error, ... }`.
 *
 * @throws {Error} If called outside of an {@link AuthProvider}.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
