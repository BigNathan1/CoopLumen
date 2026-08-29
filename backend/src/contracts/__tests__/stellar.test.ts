import { Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import { StellarService, HORIZON_RETRY_CONFIG } from '../stellar';

describe('StellarService', () => {
  const originalNetwork = StellarService.getNetwork();

  afterEach(() => {
    (StellarService as unknown as { network: string }).network = originalNetwork;
    jest.restoreAllMocks();
  });

  describe('isTestnet and isMainnet', () => {
    it('correctly identifies Testnet network', () => {
      (StellarService as unknown as { network: string }).network = Networks.TESTNET;
      expect(StellarService.isTestnet()).toBe(true);
      expect(StellarService.isMainnet()).toBe(false);
      expect(StellarService.getNetwork()).toBe(Networks.TESTNET);
    });

    it('correctly identifies Mainnet network', () => {
      (StellarService as unknown as { network: string }).network = Networks.PUBLIC;
      expect(StellarService.isTestnet()).toBe(false);
      expect(StellarService.isMainnet()).toBe(true);
      expect(StellarService.getNetwork()).toBe(Networks.PUBLIC);
    });

    it('returns false for both if an unknown network passphrase is set', () => {
      (StellarService as unknown as { network: string }).network = 'Custom Standalone Network';
      expect(StellarService.isTestnet()).toBe(false);
      expect(StellarService.isMainnet()).toBe(false);
    });
  });

  describe('loadAccount and getAccountBalance', () => {
    it('loads account from server and returns balances', async () => {
      const publicKey = Keypair.random().publicKey();
      const mockBalances = [
        { asset_type: 'native', balance: '100.0000000' },
      ] as Horizon.HorizonApi.BalanceLine[];

      const mockLoadAccount = jest.fn().mockResolvedValue({
        id: publicKey,
        balances: mockBalances,
      });

      const server = StellarService.getServer();
      jest.spyOn(server, 'loadAccount').mockImplementation(mockLoadAccount);

      const balances = await StellarService.getAccountBalance(publicKey);
      expect(mockLoadAccount).toHaveBeenCalledWith(publicKey);
      expect(balances).toEqual(mockBalances);
    });
  });

  describe('retry logic', () => {
    it('retries on 429 and 503 errors and succeeds', async () => {
      const operationMock = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '0' } } })
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce('success');

      jest.spyOn(global, 'setTimeout').mockImplementation(((
        callback: (...args: unknown[]) => void
      ) => {
        callback();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

      const result = await StellarService.call('testOp', operationMock);
      expect(result).toBe('success');
      expect(operationMock).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-retryable errors (e.g. 404)', async () => {
      const operationMock = jest
        .fn()
        .mockRejectedValue({ response: { status: 404 }, message: 'Not found' });

      await expect(StellarService.call('testOp', operationMock)).rejects.toMatchObject({
        response: { status: 404 },
      });
      expect(operationMock).toHaveBeenCalledTimes(1);
    });

    it('throws error after exhausting maxAttempts on retryable status', async () => {
      const operationMock = jest
        .fn()
        .mockRejectedValue({ response: { status: 503 }, message: 'Service Unavailable' });

      jest.spyOn(global, 'setTimeout').mockImplementation(((
        callback: (...args: unknown[]) => void
      ) => {
        callback();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

      await expect(StellarService.call('testOp', operationMock)).rejects.toMatchObject({
        response: { status: 503 },
      });
      expect(operationMock).toHaveBeenCalledTimes(HORIZON_RETRY_CONFIG.maxAttempts);
    });
  });
});

describe('StellarService.getNetworkPassphrase', () => {
  const originalEnv = process.env.STELLAR_NETWORK;

  afterEach(() => {
    process.env.STELLAR_NETWORK = originalEnv;
    jest.resetModules();
  });

  it('returns the testnet passphrase when STELLAR_NETWORK=testnet', async () => {
    jest.resetModules();
    process.env.STELLAR_NETWORK = 'testnet';
    const { StellarService: FreshStellarService } = await import('../stellar');

    expect(FreshStellarService.getNetworkPassphrase()).toBe(Networks.TESTNET);
  });

  it('returns the mainnet (public) passphrase when STELLAR_NETWORK=mainnet', async () => {
    jest.resetModules();
    process.env.STELLAR_NETWORK = 'mainnet';
    const { StellarService: FreshStellarService } = await import('../stellar');

    expect(FreshStellarService.getNetworkPassphrase()).toBe(Networks.PUBLIC);
  });

  it('defaults to the testnet passphrase when STELLAR_NETWORK is unset', async () => {
    jest.resetModules();
    delete process.env.STELLAR_NETWORK;
    const { StellarService: FreshStellarService } = await import('../stellar');

    expect(FreshStellarService.getNetworkPassphrase()).toBe(Networks.TESTNET);
  });

  it('keeps getNetwork() in sync with getNetworkPassphrase()', async () => {
    jest.resetModules();
    process.env.STELLAR_NETWORK = 'testnet';
    const { StellarService: FreshStellarService } = await import('../stellar');

    expect(FreshStellarService.getNetwork()).toBe(FreshStellarService.getNetworkPassphrase());
  });
});
