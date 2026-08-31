import { useCallback, useEffect, useState } from 'react';
import { api, setAuthToken } from '@/lib/api';

export interface WalletState {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  network: string | null;
  networkPassphrase: string | null;
}

interface ChallengeResponse {
  challenge: string;
}

interface VerifyResponse {
  token: string;
  address: string;
  expiresAt: string;
}

/** The network CoopLumen expects Freighter to be connected to. */
export const EXPECTED_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET').toUpperCase();

/**
 * Manages Freighter wallet connection state: connecting, reading the active
 * network, and exchanging a signed challenge for a backend session token so
 * subsequent API requests are authenticated as the connected address.
 * Freighter injects into the browser; SSR calls are safely no-ops.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState>({
    publicKey: null,
    connected: false,
    connecting: false,
    error: null,
    network: null,
    networkPassphrase: null,
  });

  const authenticate = useCallback(async (publicKey: string) => {
    const { signBlob } = await import('@stellar/freighter-api');

    const { challenge } = await api.post<ChallengeResponse>(
      '/api/v1/auth/challenge',
      { address: publicKey },
      { auth: false }
    );
    const signature = await signBlob(challenge, { accountToSign: publicKey });
    const verified = await api.post<VerifyResponse>(
      '/api/v1/auth/verify',
      { address: publicKey, challenge, signature },
      { auth: false }
    );
    setAuthToken(verified.token);
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const { isConnected, getPublicKey, setAllowed, getNetworkDetails } = await import(
        '@stellar/freighter-api'
      );

      const connected = await isConnected();
      if (!connected) {
        await setAllowed();
      }

      const publicKey = await getPublicKey();
      const { network, networkPassphrase } = await getNetworkDetails();

      try {
        await authenticate(publicKey);
      } catch {
        // Authentication is best-effort at connect time; the app still shows
        // wallet state and retries auth lazily when a protected call is made.
      }

      setState({
        publicKey,
        connected: true,
        connecting: false,
        error: null,
        network,
        networkPassphrase,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setState((s) => ({ ...s, connecting: false, error: message }));
    }
  }, [authenticate]);

  const disconnect = useCallback(() => {
    setAuthToken(null);
    setState({
      publicKey: null,
      connected: false,
      connecting: false,
      error: null,
      network: null,
      networkPassphrase: null,
    });
  }, []);

  // Freighter can switch networks while already connected; poll lightly so a
  // stale network reading never masks a live mismatch.
  useEffect(() => {
    if (!state.connected) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const { getNetworkDetails } = await import('@stellar/freighter-api');
        const { network, networkPassphrase } = await getNetworkDetails();
        if (!cancelled) {
          setState((s) => (s.connected ? { ...s, network, networkPassphrase } : s));
        }
      } catch {
        // Ignore transient Freighter errors while polling.
      }
    };

    const interval = setInterval(poll, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state.connected]);

  const networkMismatch = state.connected && state.network !== null && state.network !== EXPECTED_NETWORK;

  return { ...state, expectedNetwork: EXPECTED_NETWORK, networkMismatch, connect, disconnect };
}
