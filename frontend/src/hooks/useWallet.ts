import { useCallback, useEffect, useRef, useState } from 'react';
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

const INITIAL_STATE: WalletState = {
  publicKey: null,
  connected: false,
  connecting: false,
  error: null,
  network: null,
  networkPassphrase: null,
};

/** The network CoopLumen expects Freighter to be connected to. */
export const EXPECTED_NETWORK = (
  process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET'
).toUpperCase();

/**
 * Manages Freighter wallet connection state: connecting, reading the active
 * network, and exchanging a signed challenge for a backend session token so
 * subsequent API requests are authenticated as the connected address.
 * Freighter injects into the browser; SSR calls are safely no-ops.
 *
 * Auto-reconnects on mount if the site is already allowed (issue #251):
 * Freighter remembers a prior grant itself, so re-asking the user to click
 * Connect again on every page load/reload would be a needless extra step.
 * While connected, a lightweight poll watches for the user switching
 * accounts or networks *inside* Freighter itself and reacts to either.
 * `@stellar/freighter-api`'s version pinned here (`^2.0.0`) has no native
 * change-subscription API to attach a real listener to (a newer major
 * version adds one, `WatchWalletChanges` -- out of scope for this change:
 * it is a breaking API redesign across every function this hook and
 * `TransferTokenForm.tsx` call, not a drop-in addition), so this stays
 * poll-based, the same mechanism the network-only version of this effect
 * already used.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState>(INITIAL_STATE);
  // Guards the connect-on-mount effect against a state update after the
  // component has unmounted (a slow Freighter response outliving the page).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const authenticate = useCallback(async (publicKey: string) => {
    const freighter = (await import('@stellar/freighter-api')) as unknown as {
      signMessage?: (
        message: string,
        opts?: { address?: string; accountToSign?: string }
      ) => Promise<string>;
      signBlob?: (blob: string, opts?: { accountToSign?: string }) => Promise<string>;
    };

    const { challenge } = await api.post<ChallengeResponse>(
      '/api/v1/auth/challenge',
      { address: publicKey },
      { auth: false }
    );
    const signFn = freighter.signMessage ?? freighter.signBlob;
    if (!signFn) {
      throw new Error('Freighter signing function not available');
    }
    const signature = await signFn(challenge, { address: publicKey, accountToSign: publicKey });
    const verified = await api.post<VerifyResponse>(
      '/api/v1/auth/verify',
      { address: publicKey, challenge, signature },
      { auth: false }
    );
    setAuthToken(verified.token);
  }, []);

  /** Reads the current network and authenticates `publicKey`, then commits both as connected state. Shared by `connect()` and the auto-reconnect-on-mount effect so the two cannot drift. */
  const establishSession = useCallback(
    async (publicKey: string) => {
      const { getNetworkDetails } = await import('@stellar/freighter-api');
      const { network, networkPassphrase } = await getNetworkDetails();

      try {
        await authenticate(publicKey);
      } catch {
        // Authentication is best-effort at connect time; the app still shows
        // wallet state and retries auth lazily when a protected call is made.
      }

      if (!mountedRef.current) return;
      setState({
        publicKey,
        connected: true,
        connecting: false,
        error: null,
        network,
        networkPassphrase,
      });
    },
    [authenticate]
  );

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const { isConnected, getPublicKey, setAllowed } = await import('@stellar/freighter-api');

      const connected = await isConnected();
      if (!connected) {
        await setAllowed();
      }

      const publicKey = await getPublicKey();
      await establishSession(publicKey);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setState((s) => ({ ...s, connecting: false, error: message }));
    }
  }, [establishSession]);

  const disconnect = useCallback(() => {
    setAuthToken(null);
    setState(INITIAL_STATE);
  }, []);

  // Auto-reconnect on page load/reload (issue #251). `isConnected()` is not
  // the right check here -- it only reports whether the extension itself is
  // present, true even for a site it has never been asked about. `isAllowed()`
  // is the actual per-site grant check: true only once the user has approved
  // this site, at which point `getPublicKey()` can be read back without a
  // fresh prompt.
  useEffect(() => {
    (async () => {
      try {
        const { isAllowed, getPublicKey } = await import('@stellar/freighter-api');
        const allowed = await isAllowed();
        if (!allowed || !mountedRef.current) return;

        const publicKey = await getPublicKey();
        if (!mountedRef.current) return;
        await establishSession(publicKey);
      } catch {
        // Freighter not installed, or this site was never granted access --
        // stay disconnected silently; the user can still click Connect.
      }
    })();
    // Deliberately mount-only: this restores a prior grant once, the same
    // moment the page itself loads, not on every dependency change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watches for the user switching accounts or networks *inside* Freighter
  // itself while already connected, polling lightly so a stale reading of
  // either never masks a live change. See this function's doc comment for
  // why this stays poll-based rather than a native event subscription.
  useEffect(() => {
    if (!state.connected) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const { getPublicKey, getNetworkDetails } = await import('@stellar/freighter-api');
        const [publicKey, { network, networkPassphrase }] = await Promise.all([
          getPublicKey(),
          getNetworkDetails(),
        ]);
        if (cancelled) return;

        setState((s) => {
          if (!s.connected) return s;
          if (publicKey !== s.publicKey) {
            // The user switched accounts in Freighter itself: re-run the
            // full session flow (including re-authenticating) under the new
            // address rather than presenting stale data as if it were theirs.
            void establishSession(publicKey);
            return s;
          }
          return { ...s, network, networkPassphrase };
        });
      } catch {
        // Ignore transient Freighter errors while polling.
      }
    };

    const interval = setInterval(poll, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state.connected, establishSession]);

  // Undecidable until Freighter has actually reported a network, so a
  // disconnected or not-yet-resolved wallet is treated as valid rather than
  // flagged as wrong.
  const isCorrectNetwork =
    !state.connected || state.network === null || state.network === EXPECTED_NETWORK;
  const networkMismatch = state.connected && !isCorrectNetwork;

  return {
    ...state,
    expectedNetwork: EXPECTED_NETWORK,
    isCorrectNetwork,
    networkMismatch,
    connect,
    disconnect,
  };
}
