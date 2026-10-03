import { renderHook, act, waitFor } from '@testing-library/react';

const freighter = {
  isConnected: jest.fn(),
  isAllowed: jest.fn(),
  setAllowed: jest.fn(),
  getPublicKey: jest.fn(),
  getNetworkDetails: jest.fn(),
  signMessage: jest.fn(),
};

jest.mock('@stellar/freighter-api', () => freighter);

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn().mockResolvedValue({ token: 'session-token' }) },
  setAuthToken: jest.fn(),
}));

// Imported after the mocks above so useWallet's dynamic imports resolve to them.
import { useWallet, EXPECTED_NETWORK } from '../useWallet';

const PUBLIC_KEY = 'G' + 'A'.repeat(55);
const OTHER_PUBLIC_KEY = 'G' + 'B'.repeat(55);

function mockNotYetAllowed() {
  freighter.isAllowed.mockResolvedValue(false);
  freighter.isConnected.mockResolvedValue(true);
  freighter.getNetworkDetails.mockResolvedValue({
    network: EXPECTED_NETWORK,
    networkPassphrase: 'passphrase',
  });
  freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
  freighter.signMessage.mockResolvedValue('signature');
}

async function connectOnNetwork(network: string) {
  mockNotYetAllowed();
  freighter.isConnected.mockResolvedValue(true);
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
    jest.useRealTimers();
    // Every test defaults to "not previously granted", so the mount-time
    // auto-reconnect effect is a no-op unless a test opts in with
    // isAllowed.mockResolvedValue(true) — keeps the existing manual-connect
    // tests below from also racing against that effect.
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
    freighter.isConnected.mockResolvedValue(false);
    freighter.setAllowed.mockRejectedValue(new Error('User rejected access'));

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
  });

  it('restores the session on mount when the site was previously granted access, without a fresh prompt', async () => {
    freighter.isAllowed.mockResolvedValue(true);
    freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    freighter.getNetworkDetails.mockResolvedValue({
      network: EXPECTED_NETWORK,
      networkPassphrase: 'passphrase',
    });
    freighter.signMessage.mockResolvedValue('signature');

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.publicKey).toBe(PUBLIC_KEY);
    // The point of auto-reconnect: no permission prompt on the user's behalf.
    expect(freighter.setAllowed).not.toHaveBeenCalled();
  });

  it('stays disconnected on mount when the site was never granted access', async () => {
    freighter.isAllowed.mockResolvedValue(false);

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(freighter.getPublicKey).not.toHaveBeenCalled();
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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('re-authenticates under the new address when the user switches accounts in Freighter', async () => {
    mockNotYetAllowed();
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.publicKey).toBe(PUBLIC_KEY);

    freighter.getPublicKey.mockResolvedValue(OTHER_PUBLIC_KEY);

    await act(async () => {
      jest.advanceTimersByTime(5_000);
      // Flush the poll's own microtask chain (getPublicKey/getNetworkDetails
      // both resolve immediately here, but are still real Promises).
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

    freighter.getNetworkDetails.mockResolvedValue({
      network: 'PUBLIC',
      networkPassphrase: 'public-passphrase',
    });

    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.network).toBe('PUBLIC');
    expect(result.current.networkMismatch).toBe(true);
  });
});
