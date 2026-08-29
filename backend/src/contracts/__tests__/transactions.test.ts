import { Account, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { submitPayment, buildUnsignedPayment, submitSignedXdr } from '../transactions';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  },
}));

jest.mock('../../cache/balances', () => (
  {
    invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
  }
));

const mockLoadAccount = StellarService.loadAccount as jest.Mock;
const mockSubmitTransaction = StellarService.submitTransaction as jest.Mock;

const sender = Keypair.random();
const recipient = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();

beforeEach(() => {
  mockLoadAccount.mockReset();
  mockSubmitTransaction.mockReset();
  mockLoadAccount.mockImplementation((publicKey: string) =>
    Promise.resolve(new Account(publicKey, '1'))
  );
  mockSubmitTransaction.mockResolvedValue({ hash: 'tx-hash-12345' });
});

describe('transactions.ts', () => {
  describe('submitPayment', () => {
    it('submits a native XLM payment successfully and invalidates balance cache', async () => {
      const txHash = await submitPayment({
        senderSecret: sender.secret(),
        destinationPublicKey: recipient,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '10.5',
        memo: 'test payment',
      });

      expect(txHash).toBe('tx-hash-12345');
      expect(mockLoadAccount).toHaveBeenCalledWith(sender.publicKey());
      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);

      const submittedTx = mockSubmitTransaction.mock.calls[0][0] as Transaction;
      expect(submittedTx.operations).toHaveLength(1);
      expect(submittedTx.operations[0].type).toBe('payment');
      expect(submittedTx.operations[0].amount).toBe('10.5');
      expect(submittedTx.destination).toBe(recipient);
    });

    it('submits a custom asset (non-native) payment successfully', async () => {
      const txHash = await submitPayment({
        senderSecret: sender.secret(),
        destinationPublicKey: recipient,
        assetCode: 'ECO',
        assetIssuer: issuer,
        amount: '50',
      });

      expect(txHash).toBe('tx-hash-12345');
      const submittedTx = mockSubmitTransaction.mock.calls[0][0] as Transaction;
      expect(submittedTx.operations).toHaveLength(1);
      expect(submittedTx.operations[0].type).toBe('payment');
      expect(submittedTx.operations[0].asset.getCode()).toBe('ECO');
      expect(submittedTx.operations[0].asset.getIssuer()).toBe(issuer);
    });

    it('propagates Horizon submission errors without swallowing them', async () => {
      const horizonError = { response: { status: 400, data: { extras: { result_codes: { transaction: 'tx_failed', operations: ['op_underfunded'] } } } } };
      mockSubmitTransaction.mockRejectedValueOnce(horizonError);

      await expect(
        submitPayment({
          senderSecret: sender.secret(),
          destinationPublicKey: recipient,
          assetCode: 'XLM',
          assetIssuer: '',
          amount: '1000',
        })
      ).rejects.toEqual(horizonError);
    });
  });

  describe('buildUnsignedPayment', () => {
    it('builds a valid unsigned XDR string for native XLM payment', async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: sender.publicKey(),
        destinationPublicKey: recipient,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '25',
        memo: { type: 'text', value: 'unsigned memo' },
      });

      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);
      expect(mockLoadAccount).toHaveBeenCalledWith(sender.publicKey());
      expect(mockSubmitTransaction).not.toHaveBeenCalled();

      // Verify decoded XDR contains expected operations and memo
      const decoded = new Transaction(xdr, Networks.TESTNET);
      expect(decoded.operations).toHaveLength(1);
      expect(decoded.operations[0].type).toBe('payment');
      expect(decoded.memo.type).toBe('text');
    });

    it('builds an unsigned XDR string for a custom asset payment', async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: sender.publicKey(),
        destinationPublicKey: recipient,
        assetCode: 'ECO',
        assetIssuer: issuer,
        amount: '5.25',
      });

      expect(typeof xdr).toBe('string');
      const decoded = new Transaction(xdr, Networks.TESTNET);
      expect(decoded.operations[0].asset.getCode()).toBe('ECO');
    });

    it('throws when account loading fails', async () => {
      mockLoadAccount.mockRejectedValueOnce(new Error('Account not found'));

      await expect(
        buildUnsignedPayment({
          senderPublicKey: sender.publicKey(),
          destinationPublicKey: recipient,
          assetCode: 'XLM',
          assetIssuer: '',
          amount: '10',
        })
      ).rejects.toThrow('Account not found');
    });
  });

  describe('submitSignedXdr', () => {
    it('submits a pre-signed transaction envelope XDR and returns the hash', async () => {
      const account = new Account(sender.publicKey(), '5');
      const tx = new Transaction(
        {
          fee: '100',
          sequence: '6',
          operations: [],
          networkPassphrase: Networks.TESTNET,
        },
        Networks.TESTNET
      );
      tx.sign(sender);

      const signedXdr = tx.toXDR();
      mockSubmitTransaction.mockResolvedValueOnce({ hash: 'signed-hash-999' });

      const hash = await submitSignedXdr(signedXdr);

      expect(hash).toBe('signed-hash-999');
      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
    });

    it('rejects if the XDR is malformed', async () => {
      await expect(submitSignedXdr('invalid-xdr-string')).rejects.toThrow();
      expect(mockSubmitTransaction).not.toHaveBeenCalled();
    });
  });
});
