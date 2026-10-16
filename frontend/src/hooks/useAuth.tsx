'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useWallet } from '@/hooks/useWallet';

export interface AuthContextType {
  /** Connected and authenticated Stellar public address, or null if disconnected */
  publicKey: string | null;
  /** True when the user is connected to Freighter and holds an authenticated session */
  isAuthenticated: boolean;
  /** Initiates connection with Freighter and authenticates with backend */
  login: () => Promise<void>;
  /** Disconnects the wallet and clears the session */
  logout: () => void;
  /** True while wallet connection or challenge signing is in progress */
  isLoading: boolean;
  /** Any connection or authentication error message */
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
  value?: Partial<AuthContextType>;
}

/**
 * Global authentication provider.
 * Wraps children with shared authentication state derived from useWallet().
 */
export function AuthProvider({ children, value: overrideValue }: AuthProviderProps) {
  const wallet = useWallet();

  const contextValue: AuthContextType = useMemo(() => {
    if (overrideValue) {
      return {
        publicKey:
          overrideValue.publicKey !== undefined ? overrideValue.publicKey : wallet.publicKey,
        isAuthenticated:
          overrideValue.isAuthenticated !== undefined
            ? overrideValue.isAuthenticated
            : wallet.connected && Boolean(wallet.publicKey),
        login: overrideValue.login ?? wallet.connect,
        logout: overrideValue.logout ?? wallet.disconnect,
        isLoading:
          overrideValue.isLoading !== undefined ? overrideValue.isLoading : wallet.connecting,
        error: overrideValue.error !== undefined ? overrideValue.error : wallet.error,
      };
    }

    return {
      publicKey: wallet.publicKey,
      isAuthenticated: wallet.connected && Boolean(wallet.publicKey),
      login: wallet.connect,
      logout: wallet.disconnect,
      isLoading: wallet.connecting,
      error: wallet.error,
    };
  }, [overrideValue, wallet]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

/**
 * Access the active authentication state.
 * Returns `{ publicKey, isAuthenticated, login, logout }`.
 *
 * Can be called inside an `<AuthProvider>` to access shared context, or standalone
 * where it binds directly to the active Freighter wallet session.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  const wallet = useWallet();

  if (context) {
    return context;
  }

  return {
    publicKey: wallet.publicKey,
    isAuthenticated: wallet.connected && Boolean(wallet.publicKey),
    login: wallet.connect,
    logout: wallet.disconnect,
    isLoading: wallet.connecting,
    error: wallet.error,
  };
}
