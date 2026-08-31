import {
  Account,
  Asset,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

jest.mock('../stellar', () => ({
  StellarService: {
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  },
}));

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

import { StellarService } from '../stellar';
import { invalidateBalanceCache } from '../../cache/balances';
import { StellarError } from '../errors';
import {
  BatchPaymentEntry,
  MAX_BATCH_PAYMENTS,
  buildBatchPayment,
  submitBatchPayment,
} from '../batchPayments';

const sender = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 21));
const issuer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 22)).publicKey();

const loadAccount = StellarService.loadAccount as jest.Mock;
const submitTransaction = StellarService.submitTransaction as jest.Mock;

/** Deterministic destination keys, one per index. */
function destination(index: number): string {
  return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 100 + index)).publicKey();
}

function entries(count: number, overrides: Partial<BatchPaymentEntry> = {}): BatchPaymentEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    destinationPublicKey: destination(index),
    assetCode: 'COOP',
    assetIssuer: issuer,
    amount: `${index + 1}`,
    ...overrides,
  }));
}

/** The error shape the Stellar SDK attaches to a rejected submission. */
function horizonFailure(transaction: string, operations?: string[]): unknown {
  return {
    response: {
      status: 400,
      data: {
        title: 'Transaction Failed',
        extras: { result_codes: { transaction, ...(operations && { operations }) } },
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  loadAccount.mockResolvedValue(new Account(sender.publicKey(), '99'));
  submitTransaction.mockResolvedValue({ hash: 'batch-hash' });
});

describe('buildBatchPayment', () => {
  it('builds one unsigned transaction with an operation per payment, in order', async () => {
    const payments = entries(3);

    const xdr = await buildBatchPayment({
      senderPublicKey: sender.publicKey(),
      payments,
      memo: 'weekly payout',
    });

    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;

    expect(transaction.signatures).toHaveLength(0);
    expect(transaction.sequence).toBe('100');
    expect(transaction.operations).toHaveLength(3);
    expect(transaction.memo.value?.toString()).toBe('weekly payout');

    transaction.operations.forEach((operation, index) => {
      expect(operation).toMatchObject({
        type: 'payment',
        destination: payments[index].destinationPublicKey,
        amount: `${index + 1}.0000000`,
      });
    });
  });

  it('charges one base fee per operation', async () => {
    const xdr = await buildBatchPayment({
      senderPublicKey: sender.publicKey(),
      payments: entries(4),
    });

    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    expect(transaction.fee).toBe('400');
  });

  it('mixes assets within one transaction', async () => {
    const xdr = await buildBatchPayment({
      senderPublicKey: sender.publicKey(),
      payments: [
        { destinationPublicKey: destination(0), assetCode: 'XLM', assetIssuer: '', amount: '1' },
        {
          destinationPublicKey: destination(1),
          assetCode: 'COOP',
          assetIssuer: issuer,
          amount: '2',
        },
      ],
    });

    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    const [native, custom] = transaction.operations;

    expect(native.type === 'payment' && native.asset.isNative()).toBe(true);
    expect(custom.type === 'payment' && custom.asset.equals(new Asset('COOP', issuer))).toBe(true);
  });

  it('accepts a full batch of the maximum size', async () => {
    const xdr = await buildBatchPayment({
      senderPublicKey: sender.publicKey(),
      payments: entries(MAX_BATCH_PAYMENTS),
    });

    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    expect(transaction.operations).toHaveLength(MAX_BATCH_PAYMENTS);
  });

  it('rejects an empty batch before contacting Horizon', async () => {
    await expect(
      buildBatchPayment({ senderPublicKey: sender.publicKey(), payments: [] })
    ).rejects.toThrow('Batch payment build failed: at least one payment is required');
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('rejects a batch over the operation limit', async () => {
    await expect(
      buildBatchPayment({
        senderPublicKey: sender.publicKey(),
        payments: entries(MAX_BATCH_PAYMENTS + 1),
      })
    ).rejects.toThrow(
      `Batch payment build failed: a transaction carries at most ${MAX_BATCH_PAYMENTS} payments, but ${MAX_BATCH_PAYMENTS + 1} were given`
    );
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('names the offending entry when one payment is invalid', async () => {
    const payments = entries(3);
    payments[1].amount = '0';

    await expect(
      buildBatchPayment({ senderPublicKey: sender.publicKey(), payments })
    ).rejects.toThrow(
      'Batch payment build entry 2 failed: amount must be a positive decimal string with at most 7 decimal places.'
    );
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('names the offending entry when one destination is invalid', async () => {
    const payments = entries(2);
    payments[0].destinationPublicKey = 'GNOPE';

    await expect(
      buildBatchPayment({ senderPublicKey: sender.publicKey(), payments })
    ).rejects.toThrow(
      'Batch payment build entry 1 failed: destinationPublicKey is not a valid Stellar public key.'
    );
  });

  it('names the offending entry when one asset has no issuer', async () => {
    const payments = entries(2);
    payments[1].assetIssuer = '';

    await expect(
      buildBatchPayment({ senderPublicKey: sender.publicKey(), payments })
    ).rejects.toThrow('Batch payment build entry 2 failed: an asset issuer is required for COOP');
  });
});

describe('submitBatchPayment', () => {
  it('signs and submits the batch and returns the Horizon hash', async () => {
    const hash = await submitBatchPayment({
      senderSecret: sender.secret(),
      payments: entries(2),
    });

    expect(hash).toBe('batch-hash');
    expect(loadAccount).toHaveBeenCalledWith(sender.publicKey());

    const submitted = submitTransaction.mock.calls[0][0] as Transaction;
    expect(submitted.signatures).toHaveLength(1);
    expect(submitted.operations).toHaveLength(2);
  });

  it('invalidates the cached balances of the sender and every recipient', async () => {
    const payments = entries(3);

    await submitBatchPayment({ senderSecret: sender.secret(), payments });

    expect(invalidateBalanceCache).toHaveBeenCalledWith([
      sender.publicKey(),
      ...payments.map((payment) => payment.destinationPublicKey),
    ]);
  });

  it('points a failed batch at the payment that broke it', async () => {
    const payments = entries(3);
    submitTransaction.mockRejectedValueOnce(
      horizonFailure('tx_failed', ['op_success', 'op_no_trust', 'op_success'])
    );

    await expect(submitBatchPayment({ senderSecret: sender.secret(), payments })).rejects.toThrow(
      `Batch payment failed: the target account has no trustline for this asset (op_no_trust) — payment 2 of 3, to ${payments[1].destinationPublicKey}`
    );
  });

  it('keeps the result codes and status when attributing a failure', async () => {
    submitTransaction.mockRejectedValueOnce(
      horizonFailure('tx_failed', ['op_underfunded', 'op_success'])
    );

    await expect(
      submitBatchPayment({ senderSecret: sender.secret(), payments: entries(2) })
    ).rejects.toMatchObject({
      name: 'StellarError',
      status: 400,
      resultCodes: { transaction: 'tx_failed', operations: ['op_underfunded', 'op_success'] },
    });
  });

  it('leaves a transaction-level failure unattributed', async () => {
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_bad_seq'));

    await expect(
      submitBatchPayment({ senderSecret: sender.secret(), payments: entries(2) })
    ).rejects.toThrow(
      'Batch payment failed: the account sequence number was stale; rebuild and retry the transaction (tx_bad_seq)'
    );
  });

  it('reports an unfunded sender account as a 404', async () => {
    loadAccount.mockRejectedValueOnce({ response: { status: 404 } });

    await expect(
      submitBatchPayment({ senderSecret: sender.secret(), payments: entries(2) })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects an invalid sender secret before contacting Horizon', async () => {
    await expect(
      submitBatchPayment({ senderSecret: 'not-a-secret', payments: entries(2) })
    ).rejects.toThrow('Batch payment failed: senderSecret is not a valid Stellar secret key.');
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('does not invalidate cached balances when the submission fails', async () => {
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_failed', ['op_underfunded']));

    await expect(
      submitBatchPayment({ senderSecret: sender.secret(), payments: entries(1) })
    ).rejects.toBeInstanceOf(StellarError);
    expect(invalidateBalanceCache).not.toHaveBeenCalled();
  });
});
