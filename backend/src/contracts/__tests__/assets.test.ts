import { distributeAsset } from '../assets';
import { StellarService } from '../stellar';
import * as cache from '../../cache/balances';
import { Keypair } from '@stellar/stellar-sdk';
import { Account, Keypair } from '@stellar/stellar-sdk';
import { burnAsset, getTotalSupply } from '../assets';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
    call: jest.fn(),
    call: jest.fn((_operationName: string, request: () => unknown) => request()),
  },
}));

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn(),
}));

describe('distributeAsset', () => {
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;
  const mockSubmitTransaction = StellarService.submitTransaction as jest.Mock;
  const mockInvalidateCache = cache.invalidateBalanceCache as jest.Mock;

  const issuerSecret = 'SBZVMB74Z76QZ3ZZA6CO3PSGE4AIZRUV7FQNVQZNDYH2JWDQWLLVDG6';
  const issuerPublicKey = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P';
  const distributorPublicKey = 'GBUYXJ4MVNL4KXVR7ULKM7N5V2W5VLMZ4DPMQG4HNKQ3VHZK2Z2Z2Z';
  const assetCode = 'ECO';
  const amount = '100.0000000';

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Keypair.fromSecret to return a keypair with the correct public key
    jest.spyOn(Keypair, 'fromSecret').mockReturnValue(
      Keypair.fromPublicKey(issuerPublicKey)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('successfully distributes asset when trustline exists', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: issuerPublicKey,
      account_id: issuerPublicKey,
      sequence: '12345',
      balances: [
        {
          asset_type: 'native',
          balance: '1000.0000000',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: issuerPublicKey,
          balance: '5000.0000000',
        },
      ],
    });

    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'abc123def456',
      ledger: 1234,
    });

    const result = await distributeAsset({
      issuerSecret,
      assetCode,
      assetIssuer: issuerPublicKey,
      distributorPublicKey,
      amount,
    });

    expect(result).toBe('abc123def456');
    expect(mockLoadAccount).toHaveBeenCalledWith(issuerPublicKey);
    expect(mockSubmitTransaction).toHaveBeenCalled();
    expect(mockInvalidateCache).toHaveBeenCalledWith([issuerPublicKey, distributorPublicKey]);
  });

  it('successfully distributes asset with memo', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: issuerPublicKey,
      account_id: issuerPublicKey,
      sequence: '12345',
      balances: [{ asset_type: 'native', balance: '1000.0000000' }],
    });

    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'xyz789',
      ledger: 5678,
    });

    const memo = 'Initial distribution';
    const result = await distributeAsset({
      issuerSecret,
      assetCode,
      assetIssuer: issuerPublicKey,
      distributorPublicKey,
      amount,
      memo,
    });

    expect(result).toBe('xyz789');
    expect(mockSubmitTransaction).toHaveBeenCalled();
    // Verify the transaction was built with memo (we can't easily verify the XDR,
    // but we confirm the function completes successfully)
  });

  it('throws op_no_trust error when distributor has no trustline', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: issuerPublicKey,
      account_id: issuerPublicKey,
      sequence: '12345',
      balances: [{ asset_type: 'native', balance: '1000.0000000' }],
    });

    const horizonError = new Error('Transaction failed');
    (horizonError as any).response = {
      status: 400,
      data: {
        extras: {
          result_codes: {
            transaction: 'tx_failed',
            operations: ['op_no_trust'],
          },
        },
        title: 'Transaction Failed',
        detail: 'Destination account does not have a trustline for this asset.',
      },
    };

    mockSubmitTransaction.mockRejectedValueOnce(horizonError);

    await expect(
      distributeAsset({
        issuerSecret,
        assetCode,
        assetIssuer: issuerPublicKey,
        distributorPublicKey,
        amount,
      })
    ).rejects.toThrow();
  });

  it('throws op_underfunded error when issuer has insufficient balance', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: issuerPublicKey,
      account_id: issuerPublicKey,
      sequence: '12345',
      balances: [
        { asset_type: 'native', balance: '10.0000000' }, // Not enough for fee + 100 ECO
        {
          asset_type: 'credit_alphanum4',
          asset_code: assetCode,
          asset_issuer: issuerPublicKey,
          balance: '50.0000000', // Less than requested 100
        },
      ],
    });

    const horizonError = new Error('Transaction failed');
    (horizonError as any).response = {
      status: 400,
      data: {
        extras: {
          result_codes: {
            transaction: 'tx_failed',
            operations: ['op_underfunded'],
          },
        },
        title: 'Transaction Failed',
        detail: 'Insufficient balance to complete this operation.',
      },
    };

    mockSubmitTransaction.mockRejectedValueOnce(horizonError);

    await expect(
      distributeAsset({
        issuerSecret,
        assetCode,
        assetIssuer: issuerPublicKey,
        distributorPublicKey,
        amount,
      })
    ).rejects.toThrow();
  });

  it('throws tx_bad_seq error when sequence number is stale', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: issuerPublicKey,
      account_id: issuerPublicKey,
      sequence: '12345',
      balances: [{ asset_type: 'native', balance: '1000.0000000' }],
    });

    const horizonError = new Error('Transaction failed');
    (horizonError as any).response = {
      status: 400,
      data: {
        extras: {
          result_codes: {
            transaction: 'tx_bad_seq',
          },
        },
        title: 'Transaction Failed',
        detail: 'Transaction sequence number is stale.',
      },
    };

    mockSubmitTransaction.mockRejectedValueOnce(horizonError);

    await expect(
      distributeAsset({
        issuerSecret,
        assetCode,
        assetIssuer: issuerPublicKey,
        distributorPublicKey,
        amount,
      })
    ).rejects.toThrow();
  });

  it('throws Horizon network error on 503 (after retries)', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: issuerPublicKey,
      account_id: issuerPublicKey,
      sequence: '12345',
      balances: [{ asset_type: 'native', balance: '1000.0000000' }],
    });

    const horizonError = new Error('Service Unavailable');
    (horizonError as any).response = {
      status: 503,
      data: {
        title: 'Unavailable',
        detail: 'Horizon is temporarily unavailable.',
      },
    };

    mockSubmitTransaction.mockRejectedValueOnce(horizonError);

    await expect(
      distributeAsset({
        issuerSecret,
        assetCode,
        assetIssuer: issuerPublicKey,
        distributorPublicKey,
        amount,
      })
    ).rejects.toThrow();
  });

  it('throws error when issuer account not found', async () => {
    const notFoundError = new Error('Not Found');
    (notFoundError as any).response = {
      status: 404,
      data: {
        title: 'Not Found',
        detail: 'The requested resource was not found.',
      },
    };

    mockLoadAccount.mockRejectedValueOnce(notFoundError);

    await expect(
      distributeAsset({
        issuerSecret,
        assetCode,
        assetIssuer: issuerPublicKey,
        distributorPublicKey,
        amount,
      })
    ).rejects.toThrow();
  });

  it('invalidates cache for both issuer and distributor', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      id: issuerPublicKey,
      account_id: issuerPublicKey,
      sequence: '12345',
      balances: [{ asset_type: 'native', balance: '1000.0000000' }],
    });

    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'cache_test_hash',
      ledger: 9999,
    });

    await distributeAsset({
      issuerSecret,
      assetCode,
      assetIssuer: issuerPublicKey,
      distributorPublicKey,
      amount,
    });

    expect(mockInvalidateCache).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCache).toHaveBeenCalledWith([issuerPublicKey, distributorPublicKey]);
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

describe('burnAsset', () => {
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;
  const mockSubmitTransaction = StellarService.submitTransaction as jest.Mock;

  beforeEach(() => {
    mockLoadAccount.mockReset();
    mockSubmitTransaction.mockReset();
  });

  it('sends the burn amount back to the issuer and returns the tx hash', async () => {
    const holder = Keypair.random();
    const issuer = Keypair.random().publicKey();

    mockLoadAccount.mockResolvedValueOnce(new Account(holder.publicKey(), '1'));
    mockSubmitTransaction.mockResolvedValueOnce({ hash: 'burn-tx-hash' });

    const hash = await burnAsset({
      holderSecret: holder.secret(),
      assetCode: 'ECO',
      assetIssuer: issuer,
      amount: '10',
    });

    expect(hash).toBe('burn-tx-hash');
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);

    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    expect(submittedTx.operations).toHaveLength(1);
    expect(submittedTx.operations[0].type).toBe('payment');
    expect(submittedTx.operations[0].destination).toBe(issuer);
  });

  it('propagates a Horizon submission failure without swallowing it', async () => {
    const holder = Keypair.random();
    mockLoadAccount.mockResolvedValueOnce(new Account(holder.publicKey(), '1'));
    mockSubmitTransaction.mockRejectedValueOnce({ response: { status: 400 } });

    await expect(
      burnAsset({
        holderSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: Keypair.random().publicKey(),
        amount: '10',
      })
    ).rejects.toEqual({ response: { status: 400 } });
  });
});

describe('getTotalSupply', () => {
  const mockGetServer = StellarService.getServer as jest.Mock;

  beforeEach(() => {
    mockGetServer.mockReset();
  });

  it('returns the amount reported by the Horizon asset stats endpoint', async () => {
    const forIssuer = jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: [{ amount: '5000.0000000' }] }),
      }),
    });
    const forCode = jest.fn().mockReturnValue({ forIssuer });
    mockGetServer.mockReturnValue({ assets: () => ({ forCode }) });

    const supply = await getTotalSupply('ECO', 'GISSUER');

    expect(supply).toBe('5000.0000000');
    expect(forCode).toHaveBeenCalledWith('ECO');
    expect(forIssuer).toHaveBeenCalledWith('GISSUER');
  });

  it('returns zero supply when Horizon has no record for the asset', async () => {
    const forIssuer = jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: [] }),
      }),
    });
    const forCode = jest.fn().mockReturnValue({ forIssuer });
    mockGetServer.mockReturnValue({ assets: () => ({ forCode }) });

    const supply = await getTotalSupply('ECO', 'GISSUER');

    expect(supply).toBe('0.0000000');
  });
});
