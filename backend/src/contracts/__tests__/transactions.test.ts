import { Account, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { submitPayment, buildUnsignedPayment, submitSignedXdr } from '../transactions';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => (
  {
    StellarService: {
      getServer: jest.fn(),
      getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
      loadAccount: jest.fn(),
      submitTransaction: jest.fn(),
    },
  }
));

jest.mock('../../cache/balances', () => (
  {
    invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
  }
));

const mockLoadAccount = StellarService.loadAccount as jest.Mock;
const mockSubmit = StellarService.submitTransaction as jest.Mock;

const sender = Keypair.random();
const destinationPublicKey = Keypair.random().publicKey();
const HASH_MEMO = 'ab'.repeat(32);

beforeEach(() => {
  mockLoadAccount.mockReset();
  mockSubmit.mockReset();
  mockLoadAccount.mockImplementation((publicKey: string) =>
    Promise.resolve(new Account(publicKey, '1'))
  );
  mockSubmit.mockResolvedValue({ hash: 'transaction-hash-success' });
});

describe('transactions contract module', () => {
  describe('submitPayment', () => {
    it('submits a native XLM payment successfully and returns the hash', async () => {
      const hash = await submitPayment({
        senderSecret: sender.secret(),
        destinationPublicKey,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '10.5',
      });

      expect(hash).toBe('transaction-hash-success');
      expect(mockLoadAccount).toHaveBeenCalledWith(sender.publicKey());
      expect(mockSubmit).toHaveBeenCalledTimes(1);

      const [tx] = mockSubmit.mock.calls[0] as [Transaction];
      expect(tx.operations).toHaveLength(1);
      expect(tx.operations[0].type).toBe('payment');
      expect(tx.operations[0].amount).toBe('10.5');
    });

    it('submits a custom asset payment with a text memo and time bounds successfully', async () => {
      const issuerPublicKey = Keypair.random().publicKey();
      const hash = await submitPayment({
        senderSecret: sender.secret(),
        destinationPublicKey,
        assetCode: 'ECO',
        assetIssuer: issuerPublicKey,
        amount: '100',
        memo: 'community reward',
        timeBounds: {
          minTime: 1700000000,
          maxTime: 1700003600,
        },
      });

      expect(hash).toBe('transaction-hash-success');
      const [tx] = mockSubmit.mock.calls[0] as [Transaction];
      expect(tx.memo.type).toBe('text');
      expect(tx.memo.value?.toString()).toBe('community reward');
      expect(tx.timeBounds).toEqual({
        minTime: '1700000000',
        maxTime: '1700003600',
      });
    });

    it('submits a payment with a hash memo', async () => {
      const hash = await submitPayment({
        senderSecret: sender.secret(),
        destinationPublicKey,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
        memo: { type: 'hash', value: HASH_MEMO },
      });

      expect(hash).toBe('transaction-hash-success');
      const [tx] = mockSubmit.mock.calls[0] as [Transaction];
      expect(tx.memo.type).toBe('hash');
      expect((tx.memo.value as Buffer).toString('hex')).toBe(HASH_MEMO);
    });

    it('propagates Horizon submission errors', async () => {
      const horizonError = new Error('Transaction Failed');
      (horizonError as any).response = {
        status: 400,
        data: {
          extras: { result_codes: { transaction: 'tx_failed', operations: ['op_underfunded'] } },
        },
      };

      mockSubmit.mockRejectedValueOnce(horizonError);

      await expect(
        submitPayment({
          senderSecret: sender.secret(),
          destinationPublicKey,
          assetCode: 'XLM',
          assetIssuer: '',
          amount: '1000000',
        })
      ).rejects.toThrow();
    });
  });

  describe('buildUnsignedPayment', () => {
    it('builds an unsigned payment XDR string for client-side signing', async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: sender.publicKey(),
        destinationPublicKey,
        assetCode: 'ECO',
        assetIssuer: Keypair.random().publicKey(),
        amount: '50',
        memo: 'client payment',
      });

      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);

      // Verify the built XDR decodes back correctly
      const decodedTx = new Transaction(xdr, Networks.TESTNET);
      expect(decodedTx.operations).toHaveLength(1);
      expect(decodedTx.operations[0].type).toBe('payment');
      expect(decodedTx.memo.type).toBe('text');
      expect(decodedTx.memo.value?.toString()).toBe('client payment');
    });

    it('throws if the sender account does not exist or load fails', async () => {
      mockLoadAccount.mockRejectedValueOnce(new Error('Account not found'));

      await expect(
        buildUnsignedPayment({
          senderPublicKey: sender.publicKey(),
          destinationPublicKey,
          assetCode: 'XLM',
          assetIssuer: '',
          amount: '10',
        })
      ).rejects.toThrow('Account not found');
    });
  });

  describe('submitSignedXdr', () => {
    it('submits a pre-signed transaction XDR envelope successfully', async () => {
      // First build an unsigned payment, then sign it
      const xdr = await buildUnsignedPayment({
        senderPublicKey: sender.publicKey(),
        destinationPublicKey,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '25',
      });

      const tx = new Transaction(xdr, Networks.TESTNET);
      tx.sign(sender);
      const signedXdr = tx.toXDR();

      const hash = await submitSignedXdr(signedXdr);
      expect(hash).toBe('transaction-hash-success');
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed or invalid XDR envelopes', async () => {
      await expect(submitSignedXdr('invalid-xdr-string')).rejects.toThrow();
    });
  });
});
