import { renderHook, act, waitFor } from '@testing-library/react';

const freighter = {
  isConnected: jest.fn(),
  isAllowed: jest.fn(),
  setAllowed: jest.fn(),
  getAddress: jest.fn(),
  getNetworkDetails: jest.fn(),
  signMessage: jest.fn(),
};

// `WatchWalletChanges` polls internally rather than exposing a timer the test
// can tick, so the mock instead hands the test the registered callback to
// invoke directly -- simulating "Freighter reported a change" without caring
// how/when the real class would have noticed it.
let watchCallback:
  | ((params: {
      address: string;
      network: string;
      networkPassphrase: string;
      error?: { code: number; message: string };
    }) => void)
  | null = null;
const mockWatcherStop = jest.fn();

class MockWatchWalletChanges {
  watch(
    cb: (params: {
      address: string;
      network: string;
      networkPassphrase: string;
      error?: { code: number; message: string };
    }) => void
  ) {
    watchCallback = cb;
    return {};
  }
  stop() {
    mockWatcherStop();
    watchCallback = null;
  }
}

jest.mock('@stellar/freighter-api', () => ({
  ...freighter,
  WatchWalletChanges: MockWatchWalletChanges,
}));

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn().mockResolvedValue({ token: 'session-token' }) },
  setAuthToken: jest.fn(),
}));

// Imported after the mocks above so useWallet's dynamic imports resolve to them.
import { useWallet, EXPECTED_NETWORK } from '../useWallet';

const PUBLIC_KEY = 'G' + 'A'.repeat(55);
const OTHER_PUBLIC_KEY = 'G' + 'B'.repeat(55);

function mockNotYetAllowed() {
  freighter.isAllowed.mockResolvedValue({ isAllowed: false });
  freighter.isConnected.mockResolvedValue({ isConnected: true });
  freighter.getNetworkDetails.mockResolvedValue({
    network: EXPECTED_NETWORK,
    networkPassphrase: 'passphrase',
  });
  freighter.getAddress.mockResolvedValue({ address: PUBLIC_KEY });
  freighter.signMessage.mockResolvedValue({
    signedMessage: 'signature',
    signerAddress: PUBLIC_KEY,
  });
}

async function connectOnNetwork(network: string) {
  mockNotYetAllowed();
  freighter.isConnected.mockResolvedValue({ isConnected: true });
  freighter.getNetworkDetails.mockResolvedValue({ network, networkPassphrase: 'passphrase' });

  const { result } = renderHook(() => useWallet());
  await act(async () => {
    await result.current.connect();
  });
  return result;
}

describe('useWallet network validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    watchCallback = null;
    // Every test defaults to "not previously granted", so the mount-time
    // auto-reconnect effect is a no-op unless a test opts in with
    // isAllowed.mockResolvedValue({ isAllowed: true }) -- keeps the existing
    // manual-connect tests below from also racing against that effect.
    mockNotYetAllowed();
  });

  it('reports the correct network while disconnected', () => {
    const { result } = renderHook(() => useWallet());
    expect(result.current.connected).toBe(false);
    expect(result.current.isCorrectNetwork).toBe(true);
    expect(result.current.networkMismatch).toBe(false);
  });

  it('reports the correct network once connected to the expected network', async () => {
    const result = await connectOnNetwork(EXPECTED_NETWORK);

    expect(result.current.connected).toBe(true);
    expect(result.current.isCorrectNetwork).toBe(true);
    expect(result.current.networkMismatch).toBe(false);
  });

  it('flags an incorrect network once connected to an unexpected network', async () => {
    const result = await connectOnNetwork('PUBLIC');

    expect(result.current.connected).toBe(true);
    expect(result.current.network).toBe('PUBLIC');
    expect(result.current.isCorrectNetwork).toBe(false);
    expect(result.current.networkMismatch).toBe(true);
  });

  it('resets network validation on disconnect', async () => {
    const result = await connectOnNetwork('PUBLIC');
    expect(result.current.networkMismatch).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.isCorrectNetwork).toBe(true);
    expect(result.current.networkMismatch).toBe(false);
  });

  it('surfaces a connection error and does not mark the network incorrect', async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: false });
    freighter.setAllowed.mockResolvedValue({
      isAllowed: false,
      error: { code: -1, message: 'User rejected access' },
    });

    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe('User rejected access');
    expect(result.current.isCorrectNetwork).toBe(true);
  });
});

describe('useWallet auto-reconnect on mount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    watchCallback = null;
  });

  it('restores the session on mount when the site was previously granted access, without a fresh prompt', async () => {
    freighter.isAllowed.mockResolvedValue({ isAllowed: true });
    freighter.getAddress.mockResolvedValue({ address: PUBLIC_KEY });
    freighter.getNetworkDetails.mockResolvedValue({
      network: EXPECTED_NETWORK,
      networkPassphrase: 'passphrase',
    });
    freighter.signMessage.mockResolvedValue({
      signedMessage: 'signature',
      signerAddress: PUBLIC_KEY,
    });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.publicKey).toBe(PUBLIC_KEY);
    // The point of auto-reconnect: no permission prompt on the user's behalf.
    expect(freighter.setAllowed).not.toHaveBeenCalled();
  });

  it('stays disconnected on mount when the site was never granted access', async () => {
    freighter.isAllowed.mockResolvedValue({ isAllowed: false });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(freighter.getAddress).not.toHaveBeenCalled();
  });

  it('stays disconnected, without throwing, when Freighter is not installed', async () => {
    freighter.isAllowed.mockRejectedValue(new Error('Freighter is not available'));

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('useWallet reacts to changes inside Freighter while connected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    watchCallback = null;
  });

  it('re-authenticates under the new address when the user switches accounts in Freighter', async () => {
    mockNotYetAllowed();
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.publicKey).toBe(PUBLIC_KEY);
    expect(watchCallback).not.toBeNull();

    await act(async () => {
      watchCallback?.({
        address: OTHER_PUBLIC_KEY,
        network: EXPECTED_NETWORK,
        networkPassphrase: 'passphrase',
      });
      // Flush establishSession's own microtask chain.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.publicKey).toBe(OTHER_PUBLIC_KEY);
    expect(result.current.connected).toBe(true);
  });

  it('updates the reported network when it changes in Freighter without a matching address change', async () => {
    mockNotYetAllowed();
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.network).toBe(EXPECTED_NETWORK);
    expect(watchCallback).not.toBeNull();

    await act(async () => {
      watchCallback?.({
        address: PUBLIC_KEY,
        network: 'PUBLIC',
        networkPassphrase: 'public-passphrase',
      });
    });

    expect(result.current.network).toBe('PUBLIC');
    expect(result.current.networkMismatch).toBe(true);
  });

  it('stops watching on disconnect', async () => {
    mockNotYetAllowed();
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(watchCallback).not.toBeNull();

    act(() => {
      result.current.disconnect();
    });

    expect(mockWatcherStop).toHaveBeenCalled();
  });
});
