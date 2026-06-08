import { useState, useCallback } from 'react';

export interface WalletState {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

/**
 * Manages Freighter wallet connection state.
 * Freighter injects into the browser; SSR calls are safely no-ops.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState>({
    publicKey: null,
    connected: false,
    connecting: false,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const { isConnected, getPublicKey, setAllowed } = await import('@stellar/freighter-api');

      const connected = await isConnected();
      if (!connected) {
        await setAllowed();
      }

      const publicKey = await getPublicKey();
      setState({ publicKey, connected: true, connecting: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setState((s) => ({ ...s, connecting: false, error: message }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ publicKey: null, connected: false, connecting: false, error: null });
  }, []);

  return { ...state, connect, disconnect };
}
