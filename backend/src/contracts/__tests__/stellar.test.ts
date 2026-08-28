import { Networks } from '@stellar/stellar-sdk';

describe('StellarService.getNetworkPassphrase', () => {
  const originalEnv = process.env.STELLAR_NETWORK;

  afterEach(() => {
    process.env.STELLAR_NETWORK = originalEnv;
    jest.resetModules();
  });

  it('returns the testnet passphrase when STELLAR_NETWORK=testnet', async () => {
    jest.resetModules();
    process.env.STELLAR_NETWORK = 'testnet';
    const { StellarService } = await import('../stellar');

    expect(StellarService.getNetworkPassphrase()).toBe(Networks.TESTNET);
  });

  it('returns the mainnet (public) passphrase when STELLAR_NETWORK=mainnet', async () => {
    jest.resetModules();
    process.env.STELLAR_NETWORK = 'mainnet';
    const { StellarService } = await import('../stellar');

    expect(StellarService.getNetworkPassphrase()).toBe(Networks.PUBLIC);
  });

  it('defaults to the testnet passphrase when STELLAR_NETWORK is unset', async () => {
    jest.resetModules();
    delete process.env.STELLAR_NETWORK;
    const { StellarService } = await import('../stellar');

    expect(StellarService.getNetworkPassphrase()).toBe(Networks.TESTNET);
  });

  it('keeps getNetwork() in sync with getNetworkPassphrase()', async () => {
    jest.resetModules();
    process.env.STELLAR_NETWORK = 'testnet';
    const { StellarService } = await import('../stellar');

    expect(StellarService.getNetwork()).toBe(StellarService.getNetworkPassphrase());
  });
});
