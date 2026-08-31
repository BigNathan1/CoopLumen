import { Account, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { burnAsset, issueAsset } from '../assets';
import { buildUnsignedPayment, submitPayment } from '../transactions';
import { establishTrustline } from '../trustlines';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  },
}));

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

const mockLoadAccount = StellarService.loadAccount as jest.Mock;
const mockSubmit = StellarService.submitTransaction as jest.Mock;

const holder = Keypair.random();
const issuer = Keypair.random();
const destination = Keypair.random().publicKey();
const HASH_MEMO = 'ab'.repeat(32);

beforeEach(() => {
  mockLoadAccount.mockReset();
  mockSubmit.mockReset();
  mockLoadAccount.mockImplementation((publicKey: string) =>
    Promise.resolve(new Account(publicKey, '1'))
  );
  mockSubmit.mockResolvedValue({ hash: 'deadbeef' });
});

/** The memo on the transaction the builder handed to Horizon. */
function submittedMemo(): Transaction['memo'] {
  const [transaction] = mockSubmit.mock.calls[0] as [Transaction];
  return transaction.memo;
}

function decodeMemo(xdr: string): Transaction['memo'] {
  return new Transaction(xdr, Networks.TESTNET).memo;
}

describe('transaction builders accept text and hash memos', () => {
  describe('issueAsset', () => {
    it('attaches a text memo from a bare string', async () => {
      await issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: 'ECO',
        distributorPublicKey: destination,
        amount: '100',
        memo: 'initial supply',
      });

      expect(submittedMemo().type).toBe('text');
      expect(submittedMemo().value?.toString()).toBe('initial supply');
    });

    it('attaches a hash memo', async () => {
      await issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: 'ECO',
        distributorPublicKey: destination,
        amount: '100',
        memo: { type: 'hash', value: HASH_MEMO },
      });

      expect(submittedMemo().type).toBe('hash');
      expect((submittedMemo().value as Buffer).toString('hex')).toBe(HASH_MEMO);
    });

    it('attaches no memo when none is supplied', async () => {
      await issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: 'ECO',
        distributorPublicKey: destination,
        amount: '100',
      });

      expect(submittedMemo().type).toBe('none');
    });

    it('rejects an oversized text memo before reaching Horizon', async () => {
      await expect(
        issueAsset({
          issuerSecret: issuer.secret(),
          assetCode: 'ECO',
          distributorPublicKey: destination,
          amount: '100',
          memo: 'a'.repeat(29),
        })
      ).rejects.toThrow('Text memo must be 28 bytes or fewer when UTF-8 encoded (got 29).');

      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  describe('burnAsset', () => {
    it('attaches a text memo', async () => {
      await burnAsset({
        holderSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        amount: '10',
        memo: { type: 'text', value: 'quarterly burn' },
      });

      expect(submittedMemo().type).toBe('text');
      expect(submittedMemo().value?.toString()).toBe('quarterly burn');
    });

    it('attaches a hash memo', async () => {
      await burnAsset({
        holderSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        amount: '10',
        memo: { type: 'hash', value: HASH_MEMO },
      });

      expect((submittedMemo().value as Buffer).toString('hex')).toBe(HASH_MEMO);
    });

    it('attaches no memo when none is supplied', async () => {
      await burnAsset({
        holderSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        amount: '10',
      });

      expect(submittedMemo().type).toBe('none');
    });
  });

  describe('establishTrustline', () => {
    it('attaches a text memo', async () => {
      await establishTrustline({
        accountSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        memo: 'joining community',
      });

      expect(submittedMemo().type).toBe('text');
      expect(submittedMemo().value?.toString()).toBe('joining community');
    });

    it('attaches a hash memo', async () => {
      await establishTrustline({
        accountSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        memo: { type: 'hash', value: HASH_MEMO },
      });

      expect((submittedMemo().value as Buffer).toString('hex')).toBe(HASH_MEMO);
    });

    it('attaches no memo when none is supplied', async () => {
      await establishTrustline({
        accountSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
      });

      expect(submittedMemo().type).toBe('none');
    });

    it('still builds the changeTrust operation alongside the memo', async () => {
      await establishTrustline({
        accountSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        limit: '500',
        memo: 'joining community',
      });

      const [transaction] = mockSubmit.mock.calls[0] as [Transaction];
      expect(transaction.operations).toHaveLength(1);
      expect(transaction.operations[0].type).toBe('changeTrust');
    });
  });

  describe('submitPayment', () => {
    it('attaches a text memo', async () => {
      await submitPayment({
        senderSecret: holder.secret(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
        memo: 'rent',
      });

      expect(submittedMemo().type).toBe('text');
      expect(submittedMemo().value?.toString()).toBe('rent');
    });

    it('attaches a hash memo', async () => {
      await submitPayment({
        senderSecret: holder.secret(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
        memo: { type: 'hash', value: HASH_MEMO },
      });

      expect((submittedMemo().value as Buffer).toString('hex')).toBe(HASH_MEMO);
    });

    it('rejects a malformed hash memo before reaching Horizon', async () => {
      await expect(
        submitPayment({
          senderSecret: holder.secret(),
          destinationPublicKey: destination,
          assetCode: 'XLM',
          assetIssuer: '',
          amount: '5',
          memo: { type: 'hash', value: 'not-hex' },
        })
      ).rejects.toThrow('Hash memo must be exactly 64 hexadecimal characters (32 bytes).');

      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  describe('buildUnsignedPayment', () => {
    it('encodes a text memo into the returned XDR', async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: holder.publicKey(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
        memo: 'rent',
      });

      expect(decodeMemo(xdr).type).toBe('text');
      expect(decodeMemo(xdr).value?.toString()).toBe('rent');
    });

    it('encodes a hash memo into the returned XDR', async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: holder.publicKey(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
        memo: { type: 'hash', value: HASH_MEMO },
      });

      expect(decodeMemo(xdr).type).toBe('hash');
      expect((decodeMemo(xdr).value as Buffer).toString('hex')).toBe(HASH_MEMO);
    });

    it('encodes no memo when none is supplied', async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: holder.publicKey(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
      });

      expect(decodeMemo(xdr).type).toBe('none');
    });
  });
});
