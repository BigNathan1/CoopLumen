import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchWalletChanges } from '@stellar/freighter-api';
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
 * While connected, `WatchWalletChanges` (native to `@stellar/freighter-api`
 * v6+, added after this hook's `^2.0.0` had no change-subscription API at
 * all) watches for the user switching accounts or networks *inside*
 * Freighter itself and reacts to either. It still polls internally -- there
 * is no real push event from the extension -- so the 5s interval passed to
 * it below matches the cadence this hook polled manually before v6.
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
    const { signMessage } = await import('@stellar/freighter-api');

    const { challenge } = await api.post<ChallengeResponse>(
      '/api/v1/auth/challenge',
      { address: publicKey },
      { auth: false }
    );
    const { signedMessage, error } = await signMessage(challenge, { address: publicKey });
    if (error || !signedMessage) {
      throw new Error(error?.message ?? 'Freighter declined to sign the challenge');
    }
    // v6's type still allows a legacy Buffer return for an older extension
    // message format; every current Freighter build resolves a plain string.
    const signature = typeof signedMessage === 'string' ? signedMessage : signedMessage.toString();
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
      const { network, networkPassphrase, error } = await getNetworkDetails();
      if (error) {
        throw new Error(error.message);
      }

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
      const { isConnected, getAddress, setAllowed } = await import('@stellar/freighter-api');

      const { isConnected: connected } = await isConnected();
      if (!connected) {
        const { error } = await setAllowed();
        if (error) {
          throw new Error(error.message);
        }
      }

      const { address, error } = await getAddress();
      if (error) {
        throw new Error(error.message);
      }
      await establishSession(address);
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
  // this site, at which point `getAddress()` can be read back without a
  // fresh prompt.
  useEffect(() => {
    (async () => {
      try {
        const { isAllowed, getAddress } = await import('@stellar/freighter-api');
        const { isAllowed: allowed } = await isAllowed();
        if (!allowed || !mountedRef.current) return;

        const { address, error } = await getAddress();
        if (error) {
          throw new Error(error.message);
        }
        if (!mountedRef.current) return;
        await establishSession(address);
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
  // itself while already connected, via the native subscription described in
  // this function's doc comment.
  useEffect(() => {
    if (!state.connected) return;

    let cancelled = false;
    let watcher: WatchWalletChanges | null = null;

    (async () => {
      const { WatchWalletChanges } = await import('@stellar/freighter-api');
      if (cancelled) return;

      watcher = new WatchWalletChanges(5_000);
      watcher.watch(({ address, network, networkPassphrase, error }) => {
        // On a transient error, `WatchWalletChanges` can still invoke the
        // callback again right after with blank fields (its internal
        // "changed" check compares against the real last-known values) --
        // both are ignored the same way the old poll's catch block ignored
        // transient errors.
        if (cancelled || error || !address) return;

        setState((s) => {
          if (!s.connected) return s;
          if (address !== s.publicKey) {
            // The user switched accounts in Freighter itself: re-run the
            // full session flow (including re-authenticating) under the new
            // address rather than presenting stale data as if it were theirs.
            void establishSession(address);
            return s;
          }
          return { ...s, network, networkPassphrase };
        });
      });
    })();

    return () => {
      cancelled = true;
      watcher?.stop();
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
    authenticate,
  };
}
