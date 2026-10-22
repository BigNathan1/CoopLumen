import '@testing-library/jest-dom';

/**
 * Global Freighter API mock
 *
 * Freighter is the Stellar wallet browser extension used throughout the
 * frontend. Tests need a mock because:
 * - The real extension is not available in the Node test environment
 * - Dynamic imports of @stellar/freighter-api would fail without it
 * - Many components/hooks use wallet features that need to be simulated
 *
 * This global mock provides default implementations for all Freighter APIs.
 * Individual tests can override these with jest.mocked() when they need
 * specific behaviors.
 */

// Mock WatchWalletChanges class for observing wallet state changes
class MockWatchWalletChanges {
  private callback:
    | ((params: {
        address: string;
        network: string;
        networkPassphrase: string;
        error?: { code: number; message: string };
      }) => void)
    | null = null;

  watch(
    cb: (params: {
      address: string;
      network: string;
      networkPassphrase: string;
      error?: { code: number; message: string };
    }) => void
  ) {
    this.callback = cb;
    return {};
  }

  stop() {
    this.callback = null;
  }
}

// Default mock implementations for all Freighter API functions
const mockFreighterApi = {
  // Connection and permission APIs
  isConnected: jest.fn().mockResolvedValue({ isConnected: false }),
  isAllowed: jest.fn().mockResolvedValue({ isAllowed: false }),
  setAllowed: jest.fn().mockResolvedValue({ isAllowed: true }),

  // Account APIs
  getAddress: jest
    .fn()
    .mockResolvedValue({ address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }),
  getPublicKey: jest
    .fn()
    .mockResolvedValue({ publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }),

  // Network APIs
  getNetwork: jest.fn().mockResolvedValue({ network: 'TESTNET' }),
  getNetworkDetails: jest.fn().mockResolvedValue({
    network: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
    networkUrl: 'https://horizon-testnet.stellar.org',
  }),

  // Transaction signing APIs
  signTransaction: jest.fn().mockResolvedValue({
    signedTxXdr: 'signed-transaction-xdr',
    signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  }),
  signAuthEntry: jest.fn().mockResolvedValue({
    signedAuthEntry: 'signed-auth-entry',
    signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  }),

  // Message signing API
  signMessage: jest.fn().mockResolvedValue({
    signedMessage: 'signed-message',
    signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  }),

  // Watcher class for observing wallet changes
  WatchWalletChanges: MockWatchWalletChanges,
};

// Install the global mock
jest.mock('@stellar/freighter-api', () => mockFreighterApi);

// Export for tests that need to access the mocks
export { mockFreighterApi };
