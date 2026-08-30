import { Account, Asset, Claimant, Keypair, Networks } from '@stellar/stellar-sdk';
import { create } from '../claimableBalance';
import { StellarService } from '../stellar';
import { toStellarError } from '../errors';

jest.mock('../stellar', () => ({
  StellarService: {
    getNetwork: jest.fn().mockReturnValue(Networks.TESTNET),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  },
}));

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

describe('claimableBalance.create', () => {
  const sourceKeypair = Keypair.random();
  const recipientPublicKey = Keypair.random().publicKey();
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;
  const mockSubmitTransaction = StellarService.submitTransaction as jest.Mock;

  beforeEach(() => {
    mockLoadAccount.mockReset();
    mockSubmitTransaction.mockReset();
    jest.clearAllMocks();
  });

  it('creates a claimable balance and returns balanceId, txHash, and ledger', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'abc123def456',
      ledger: 1234,
      id: 'balance-id-xyz-123456789',
    });

    const result = await create({
      asset: Asset.native(),
      amount: '100.0000000',
      claimants: [new Claimant(recipientPublicKey)],
      sourceKeypair,
    });

    expect(result.txHash).toBe('abc123def456');
    expect(result.ledger).toBe(1234);
    expect(result.balanceId).toBe('balance-id-xyz-123456789');
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
  });

  it('uses CreateClaimableBalance operation', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '50'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'tx-hash',
      ledger: 100,
      id: 'balance-id',
    });

    await create({
      asset: new Asset('USDC', 'GATEMHCCKCY67ZUCKTROYN24ZYT5GK4EQZ65JJLDHKHRUZI3EUEKMTCH'),
      amount: '50.5000000',
      claimants: [new Claimant(recipientPublicKey)],
      sourceKeypair,
    });

    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    expect(submittedTx.operations).toHaveLength(1);

    const operation = submittedTx.operations[0];
    expect(operation.type).toBe('createClaimableBalance');
    if (operation.type === 'createClaimableBalance') {
      expect(operation.amount).toBe('50.5000000');
      expect(operation.claimants).toHaveLength(1);
    }
  });

  it('accepts text memo and includes it in the transaction', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '10'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'tx-hash',
      ledger: 50,
      id: 'balance-id',
    });

    await create({
      asset: Asset.native(),
      amount: '100',
      claimants: [new Claimant(recipientPublicKey)],
      sourceKeypair,
      memo: 'Payment for services',
    });

    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    expect(submittedTx.memo).toBeDefined();
    expect(submittedTx.memo.type).toBe('text');
  });

  it('accepts hash memo via tagged object', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '10'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'tx-hash',
      ledger: 50,
      id: 'balance-id',
    });

    const hashValue = 'a'.repeat(64); // 64 hex chars = 32 bytes

    await create({
      asset: Asset.native(),
      amount: '100',
      claimants: [new Claimant(recipientPublicKey)],
      sourceKeypair,
      memo: { type: 'hash', value: hashValue },
    });

    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    expect(submittedTx.memo).toBeDefined();
    expect(submittedTx.memo.type).toBe('hash');
  });

  it('supports multiple claimants with different predicates', async () => {
    const claimant1 = Keypair.random().publicKey();
    const claimant2 = Keypair.random().publicKey();

    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '5'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'tx-hash',
      ledger: 200,
      id: 'balance-id',
    });

    const claimants = [
      new Claimant(claimant1),
      new Claimant(claimant2, Claimant.predicateBeforeAbsoluteTime('2025-12-31T23:59:59Z')),
    ];

    await create({
      asset: Asset.native(),
      amount: '200',
      claimants,
      sourceKeypair,
    });

    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    const operation = submittedTx.operations[0];
    if (operation.type === 'createClaimableBalance') {
      expect(operation.claimants).toHaveLength(2);
    }
  });

  it('throws StellarError when op_low_reserve result code is returned', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '5'));
    mockSubmitTransaction.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          extras: {
            result_codes: {
              operations: ['op_low_reserve'],
              transaction: 'tx_failed',
            },
          },
        },
      },
    });

    await expect(
      create({
        asset: Asset.native(),
        amount: '100',
        claimants: [new Claimant(recipientPublicKey)],
        sourceKeypair,
      })
    ).rejects.toThrow(/does not hold enough XLM/i);
  });

  it('throws StellarError when op_no_trust result code is returned', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          extras: {
            result_codes: {
              operations: ['op_no_trust'],
              transaction: 'tx_failed',
            },
          },
        },
      },
    });

    await expect(
      create({
        asset: new Asset('USDC', 'GATEMHCCKCY67ZUCKTROYN24ZYT5GK4EQZ65JJLDHKHRUZI3EUEKMTCH'),
        amount: '100',
        claimants: [new Claimant(recipientPublicKey)],
        sourceKeypair,
      })
    ).rejects.toThrow(/trustline/i);
  });

  it('throws StellarError when op_malformed result code is returned', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          extras: {
            result_codes: {
              operations: ['op_malformed'],
              transaction: 'tx_failed',
            },
          },
        },
      },
    });

    await expect(
      create({
        asset: Asset.native(),
        amount: '100',
        claimants: [new Claimant(recipientPublicKey)],
        sourceKeypair,
      })
    ).rejects.toThrow(/malformed|invalid/i);
  });

  it('throws StellarError when tx_bad_seq is returned and retries once', async () => {
    const sourceAccount = new Account(sourceKeypair.publicKey(), '100');

    // First attempt: bad sequence
    mockLoadAccount.mockResolvedValueOnce(sourceAccount);
    mockSubmitTransaction.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          extras: {
            result_codes: {
              transaction: 'tx_bad_seq',
            },
          },
        },
      },
    });

    // After invalidation, reload the account for retry
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '101'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'tx-hash-retry',
      ledger: 500,
      id: 'balance-id-retry',
    });

    const result = await create({
      asset: Asset.native(),
      amount: '100',
      claimants: [new Claimant(recipientPublicKey)],
      sourceKeypair,
    });

    // Should succeed on retry
    expect(result.txHash).toBe('tx-hash-retry');
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(2);
  });

  it('throws StellarError when tx_insufficient_fee is returned', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          extras: {
            result_codes: {
              transaction: 'tx_insufficient_fee',
            },
          },
        },
      },
    });

    await expect(
      create({
        asset: Asset.native(),
        amount: '100',
        claimants: [new Claimant(recipientPublicKey)],
        sourceKeypair,
      })
    ).rejects.toThrow(/fee.*too low/i);
  });

  it('throws StellarError when Horizon returns 404 (account not found)', async () => {
    mockLoadAccount.mockRejectedValueOnce({
      response: {
        status: 404,
        statusText: 'Not Found',
      },
    });

    await expect(
      create({
        asset: Asset.native(),
        amount: '100',
        claimants: [new Claimant(recipientPublicKey)],
        sourceKeypair,
      })
    ).rejects.toThrow(/account.*not found|fund the account/i);
  });

  it('throws StellarError when Horizon returns 429 (rate limited)', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockRejectedValueOnce({
      response: {
        status: 429,
        statusText: 'Too Many Requests',
      },
    });

    await expect(
      create({
        asset: Asset.native(),
        amount: '100',
        claimants: [new Claimant(recipientPublicKey)],
        sourceKeypair,
      })
    ).rejects.toThrow(/rate limit/i);
  });

  it('never surfaces raw Horizon error object to callers', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockRejectedValueOnce(
      new Error('raw internal horizon error with secret internal details')
    );

    try {
      await create({
        asset: Asset.native(),
        amount: '100',
        claimants: [new Claimant(recipientPublicKey)],
        sourceKeypair,
      });
      fail('Should have thrown');
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).not.toContain('internal horizon error');
      expect(msg).not.toContain('secret internal details');
      expect(msg).toMatch(/claimable balance|failed/i);
    }
  });

  it('applies time bounds when provided', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'tx-hash',
      ledger: 300,
      id: 'balance-id',
    });

    const now = Math.floor(Date.now() / 1000);

    await create({
      asset: Asset.native(),
      amount: '100',
      claimants: [new Claimant(recipientPublicKey)],
      sourceKeypair,
      timeBounds: { minTime: now, maxTime: now + 300 },
    });

    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    expect(submittedTx.timeBounds).toBeDefined();
    expect(submittedTx.timeBounds.minTime).toBe(now.toString());
    expect(submittedTx.timeBounds.maxTime).toBe((now + 300).toString());
  });

  it('signs the transaction with the source keypair', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'tx-hash',
      ledger: 400,
      id: 'balance-id',
    });

    await create({
      asset: Asset.native(),
      amount: '100',
      claimants: [new Claimant(recipientPublicKey)],
      sourceKeypair,
    });

    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    expect(submittedTx.signatures).toHaveLength(1);
  });

  it('invalidates balance cache after successful creation', async () => {
    const { invalidateBalanceCache } = require('../../cache/balances');

    mockLoadAccount.mockResolvedValueOnce(new Account(sourceKeypair.publicKey(), '100'));
    mockSubmitTransaction.mockResolvedValueOnce({
      hash: 'tx-hash',
      ledger: 500,
      id: 'balance-id',
    });

    await create({
      asset: Asset.native(),
      amount: '100',
      claimants: [new Claimant(recipientPublicKey)],
      sourceKeypair,
    });

    expect(invalidateBalanceCache).toHaveBeenCalledWith([sourceKeypair.publicKey()]);
  });
});
