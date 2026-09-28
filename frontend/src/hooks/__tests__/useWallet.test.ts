import { renderHook, act } from '@testing-library/react';

const freighter = {
  isConnected: jest.fn(),
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

async function connectOnNetwork(network: string) {
  freighter.isConnected.mockResolvedValue(true);
  freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
  freighter.getNetworkDetails.mockResolvedValue({ network, networkPassphrase: 'passphrase' });
  freighter.signMessage.mockResolvedValue('signature');

  const { result } = renderHook(() => useWallet());
  await act(async () => {
    await result.current.connect();
  });
  return result;
}

describe('useWallet network validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
