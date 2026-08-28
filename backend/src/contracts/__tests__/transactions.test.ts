import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
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
import { buildUnsignedPayment, submitPayment, submitSignedXdr } from '../transactions';

const sender = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const destination = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const issuer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();

const loadAccount = StellarService.loadAccount as jest.Mock;
const submitTransaction = StellarService.submitTransaction as jest.Mock;

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

function paymentParams(overrides: Record<string, unknown> = {}): {
  senderSecret: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo?: string;
} {
  return {
    senderSecret: sender.secret(),
    destinationPublicKey: destination,
    assetCode: 'COOP',
    assetIssuer: issuer,
    amount: '25.5',
    ...overrides,
  } as ReturnType<typeof paymentParams>;
}

beforeEach(() => {
  jest.clearAllMocks();
  loadAccount.mockResolvedValue(new Account(sender.publicKey(), '41'));
  submitTransaction.mockResolvedValue({ hash: 'tx-hash' });
});

describe('submitPayment', () => {
  it('signs and submits a custom-asset payment and returns the Horizon hash', async () => {
    const hash = await submitPayment(paymentParams({ memo: 'payout' }));

    expect(hash).toBe('tx-hash');
    expect(loadAccount).toHaveBeenCalledWith(sender.publicKey());

    const submitted = submitTransaction.mock.calls[0][0] as Transaction;
    const operation = submitted.operations[0];

    expect(submitted.sequence).toBe('42');
    expect(submitted.signatures).toHaveLength(1);
    expect(submitted.operations).toHaveLength(1);
    expect(operation).toMatchObject({ type: 'payment', destination, amount: '25.5000000' });
    expect(operation.type === 'payment' && operation.asset.equals(new Asset('COOP', issuer))).toBe(
      true
    );
    expect(submitted.memo.value?.toString()).toBe('payout');
  });

  it('pays in native XLM without requiring an issuer', async () => {
    await submitPayment(paymentParams({ assetCode: 'XLM', assetIssuer: '' }));

    const submitted = submitTransaction.mock.calls[0][0] as Transaction;
    const operation = submitted.operations[0];
    expect(operation.type === 'payment' && operation.asset.isNative()).toBe(true);
  });

  it('invalidates the cached balances of both sides of the payment', async () => {
    await submitPayment(paymentParams());

    expect(invalidateBalanceCache).toHaveBeenCalledWith([sender.publicKey(), destination]);
  });

  it('translates op_underfunded into an actionable message', async () => {
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_failed', ['op_underfunded']));

    await expect(submitPayment(paymentParams())).rejects.toMatchObject({
      name: 'StellarError',
      status: 400,
      message:
        'Payment failed: the source account does not hold enough of the asset (op_underfunded)',
      resultCodes: { transaction: 'tx_failed', operations: ['op_underfunded'] },
    });
  });

  it('translates a missing destination trustline into an actionable message', async () => {
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_failed', ['op_no_trust']));

    await expect(submitPayment(paymentParams())).rejects.toThrow(
      'Payment failed: the target account has no trustline for this asset (op_no_trust)'
    );
  });

  it('translates a stale sequence number into a retry hint', async () => {
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_bad_seq'));

    await expect(submitPayment(paymentParams())).rejects.toThrow(/tx_bad_seq/);
  });

  it('reports an unfunded sender account as a 404', async () => {
    loadAccount.mockRejectedValueOnce({ response: { status: 404 } });

    await expect(submitPayment(paymentParams())).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining('was not found on this Stellar network'),
    });
  });

  it('keeps the Horizon response on the error so the API mapper still sees it', async () => {
    const failure = horizonFailure('tx_failed', ['op_no_trust']);
    submitTransaction.mockRejectedValueOnce(failure);

    await expect(submitPayment(paymentParams())).rejects.toMatchObject({
      response: (failure as { response: unknown }).response,
    });
  });

  it('rejects an invalid sender secret before contacting Horizon', async () => {
    await expect(submitPayment(paymentParams({ senderSecret: 'not-a-secret' }))).rejects.toThrow(
      'Payment failed: the sender secret is not a valid Stellar secret key'
    );
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('rejects an invalid destination before contacting Horizon', async () => {
    await expect(
      submitPayment(paymentParams({ destinationPublicKey: 'GNOPE' }))
    ).rejects.toBeInstanceOf(StellarError);
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.12345678', 'abc'])(
    'rejects the invalid amount %p before contacting Horizon',
    async (amount) => {
      await expect(submitPayment(paymentParams({ amount }))).rejects.toThrow(
        'Payment failed: the amount must be a positive number with at most 7 decimal places'
      );
      expect(loadAccount).not.toHaveBeenCalled();
    }
  );

  it('rejects a memo longer than 28 bytes before contacting Horizon', async () => {
    await expect(submitPayment(paymentParams({ memo: '\u{1F680}'.repeat(8) }))).rejects.toThrow(
      'Payment failed: the memo must be 28 bytes or fewer'
    );
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('rejects a non-native asset with no issuer', async () => {
    await expect(submitPayment(paymentParams({ assetIssuer: '' }))).rejects.toThrow(
      'Payment failed: an asset issuer is required for COOP'
    );
  });

  it('does not invalidate cached balances when the submission fails', async () => {
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_failed', ['op_underfunded']));

    await expect(submitPayment(paymentParams())).rejects.toBeInstanceOf(StellarError);
    expect(invalidateBalanceCache).not.toHaveBeenCalled();
  });
});

describe('buildUnsignedPayment', () => {
  it('returns an unsigned envelope built on the Horizon sequence number', async () => {
    const xdr = await buildUnsignedPayment({
      senderPublicKey: sender.publicKey(),
      destinationPublicKey: destination,
      assetCode: 'COOP',
      assetIssuer: issuer,
      amount: '1',
    });

    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    expect(transaction.signatures).toHaveLength(0);
    expect(transaction.sequence).toBe('42');
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it('maps a Horizon failure the same way as a submission', async () => {
    loadAccount.mockRejectedValueOnce({ response: { status: 429 } });

    await expect(
      buildUnsignedPayment({
        senderPublicKey: sender.publicKey(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '1',
      })
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe('submitSignedXdr', () => {
  it('submits a signed envelope and returns the hash', async () => {
    const transaction = new TransactionBuilder(new Account(sender.publicKey(), '41'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: '1' }))
      .setTimeout(30)
      .build();
    transaction.sign(sender);

    await expect(submitSignedXdr(transaction.toXDR())).resolves.toBe('tx-hash');
    expect(submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed envelope without contacting Horizon', async () => {
    await expect(submitSignedXdr('not-xdr')).rejects.toThrow(
      'Transaction submission failed: the XDR is not a valid transaction envelope for the configured network'
    );
    expect(submitTransaction).not.toHaveBeenCalled();
  });
});
