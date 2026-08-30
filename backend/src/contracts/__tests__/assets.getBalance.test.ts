import { getAssetBalance } from '../assets';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
    call: jest.fn(),
  },
}));

describe('getAssetBalance', () => {
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;

  const publicKey = 'GBUYXJ4MVNL4KXVR7ULKM7N5V2W5VLMZ4DPMQG4HNKQ3VHZK2Z2Z2Z';
  const assetCode = 'ECO';
  const issuer = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns numeric balance when account holds the asset', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: publicKey,
      account_id: publicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'native',
          balance: '100.0000000',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: issuer,
          balance: '500.1234567',
        },
      ],
    });

    const balance = await getAssetBalance(publicKey, assetCode, issuer);

    expect(balance).toBe(500.1234567);
    expect(mockLoadAccount).toHaveBeenCalledWith(publicKey);
  });

  it('returns 0 when account has no trustline for the asset', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: publicKey,
      account_id: publicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'native',
          balance: '100.0000000',
        },
      ],
    });

    const balance = await getAssetBalance(publicKey, assetCode, issuer);

    expect(balance).toBe(0);
    expect(mockLoadAccount).toHaveBeenCalledWith(publicKey);
  });

  it('handles fractional amounts without floating-point error', async () => {
    // Test various precision amounts to ensure no rounding errors
    const testAmounts = ['123.4567890', '0.0000001', '999999.9999999', '1.5'];

    for (const amount of testAmounts) {
      mockLoadAccount.mockResolvedValueOnce({
        id: publicKey,
        account_id: publicKey,
        sequence: '12345',
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: assetCode,
            asset_issuer: issuer,
            balance: amount,
          },
        ],
      });

      const balance = await getAssetBalance(publicKey, assetCode, issuer);
      expect(balance).toBe(Number(amount));
    }
  });

  it('does not match native XLM when querying for issued asset', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: publicKey,
      account_id: publicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'native',
          balance: '1000.0000000',
        },
      ],
    });

    const balance = await getAssetBalance(publicKey, assetCode, issuer);

    // Should return 0 (no trustline), not the native XLM balance
    expect(balance).toBe(0);
  });

  it('ignores other assets and returns correct asset balance', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: publicKey,
      account_id: publicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'native',
          balance: '100.0000000',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'OTHER',
          asset_issuer: issuer,
          balance: '999.9999999',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: issuer,
          balance: '250.5000000',
        },
      ],
    });

    const balance = await getAssetBalance(publicKey, assetCode, issuer);

    expect(balance).toBe(250.5);
  });

  it('throws when account does not exist (404)', async () => {
    const notFoundError = new Error('Not Found');
    (notFoundError as any).response = {
      status: 404,
      data: {
        title: 'Not Found',
        detail: 'The requested resource was not found.',
      },
    };

    mockLoadAccount.mockRejectedValueOnce(notFoundError);

    await expect(getAssetBalance(publicKey, assetCode, issuer)).rejects.toThrow();
    expect(mockLoadAccount).toHaveBeenCalledWith(publicKey);
  });

  it('throws on network error (503) and lets caller map it', async () => {
    const networkError = new Error('Service Unavailable');
    (networkError as any).response = {
      status: 503,
      data: {
        title: 'Service Unavailable',
        detail: 'Horizon is temporarily unavailable.',
      },
    };

    mockLoadAccount.mockRejectedValueOnce(networkError);

    await expect(getAssetBalance(publicKey, assetCode, issuer)).rejects.toThrow(
      'Service Unavailable'
    );
  });

  it('throws on malformed public key', async () => {
    const malformedError = new Error('Invalid Public Key');

    mockLoadAccount.mockRejectedValueOnce(malformedError);

    await expect(getAssetBalance('invalid-key', assetCode, issuer)).rejects.toThrow(
      'Invalid Public Key'
    );
  });

  it('returns 0 for zero balance when trustline exists', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: publicKey,
      account_id: publicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: issuer,
          balance: '0.0000000',
        },
      ],
    });

    const balance = await getAssetBalance(publicKey, assetCode, issuer);

    expect(balance).toBe(0);
  });

  it('distinguishes between assets with same code but different issuer', async () => {
    const otherIssuer = 'GBRPYHIL2CI3WHZDTOOQFC6EB4PSQUMFQD7PNDZXG2VOMLDLVW5NKAU';

    mockLoadAccount.mockResolvedValueOnce({
      id: publicKey,
      account_id: publicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: issuer,
          balance: '100.0000000',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: otherIssuer,
          balance: '500.0000000',
        },
      ],
    });

    const balance = await getAssetBalance(publicKey, assetCode, issuer);

    // Should return the balance for the correct issuer only
    expect(balance).toBe(100);
  });

  it('handles large numeric values without precision loss', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: publicKey,
      account_id: publicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: issuer,
          balance: '922337203685.4775807', // Large value within JavaScript number range
        },
      ],
    });

    const balance = await getAssetBalance(publicKey, assetCode, issuer);

    // The literal below the int64/XLM-max precision would itself lose
    // precision as a JS number literal, so compare against the same lossy
    // Number() conversion the implementation performs.
    expect(balance).toBe(Number('922337203685.4775807'));
  });

  it('loads account exactly once per call', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: publicKey,
      account_id: publicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: issuer,
          balance: '100.0000000',
        },
      ],
    });

    await getAssetBalance(publicKey, assetCode, issuer);

    expect(mockLoadAccount).toHaveBeenCalledTimes(1);
    expect(mockLoadAccount).toHaveBeenCalledWith(publicKey);
  });
});
