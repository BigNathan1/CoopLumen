import { Account, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { burnAsset, issueAsset } from '../assets';
import { buildUnsignedPayment, submitPayment } from '../transactions';
import { establishTrustline } from '../trustlines';
import { DEFAULT_TIMEOUT_SECONDS, TimeBoundsValidationError } from '../timeBounds';
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

const NOW = 1_700_000_000;
const at = (offsetSeconds: number): number => NOW + offsetSeconds;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW * 1000);
  mockLoadAccount.mockReset();
  mockSubmit.mockReset();
  mockLoadAccount.mockImplementation((publicKey: string) =>
    Promise.resolve(new Account(publicKey, '1'))
  );
  mockSubmit.mockResolvedValue({ hash: 'deadbeef' });
});

afterEach(() => {
  jest.useRealTimers();
});

/** Time bounds on the transaction the builder handed to Horizon. */
function submittedTimeBounds(): Transaction['timeBounds'] {
  const [transaction] = mockSubmit.mock.calls[0] as [Transaction];
  return transaction.timeBounds;
}

const DEFAULT_BOUNDS = { minTime: '0', maxTime: String(NOW + DEFAULT_TIMEOUT_SECONDS) };
const EXPLICIT_BOUNDS = { minTime: at(60), maxTime: at(600) };
const EXPECTED_EXPLICIT = { minTime: String(at(60)), maxTime: String(at(600)) };

describe('transaction builders accept explicit time bounds', () => {
  describe('issueAsset', () => {
    it('applies the default expiry window when no bounds are given', async () => {
      await issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: 'ECO',
        distributorPublicKey: destination,
        amount: '100',
      });

      expect(submittedTimeBounds()).toEqual(DEFAULT_BOUNDS);
    });

    it('applies explicit bounds', async () => {
      await issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: 'ECO',
        distributorPublicKey: destination,
        amount: '100',
        timeBounds: EXPLICIT_BOUNDS,
      });

      expect(submittedTimeBounds()).toEqual(EXPECTED_EXPLICIT);
    });

    it('rejects bounds that have already elapsed before reaching Horizon', async () => {
      await expect(
        issueAsset({
          issuerSecret: issuer.secret(),
          assetCode: 'ECO',
          distributorPublicKey: destination,
          amount: '100',
          timeBounds: { maxTime: at(-10) },
        })
      ).rejects.toThrow(TimeBoundsValidationError);

      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  describe('burnAsset', () => {
    it('applies the default expiry window when no bounds are given', async () => {
      await burnAsset({
        holderSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        amount: '10',
      });

      expect(submittedTimeBounds()).toEqual(DEFAULT_BOUNDS);
    });

    it('applies explicit bounds', async () => {
      await burnAsset({
        holderSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        amount: '10',
        timeBounds: EXPLICIT_BOUNDS,
      });

      expect(submittedTimeBounds()).toEqual(EXPECTED_EXPLICIT);
    });
  });

  describe('establishTrustline', () => {
    it('applies the default expiry window when no bounds are given', async () => {
      await establishTrustline({
        accountSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
      });

      expect(submittedTimeBounds()).toEqual(DEFAULT_BOUNDS);
    });

    it('applies explicit bounds while still building the changeTrust operation', async () => {
      await establishTrustline({
        accountSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuer.publicKey(),
        limit: '500',
        timeBounds: EXPLICIT_BOUNDS,
      });

      const [transaction] = mockSubmit.mock.calls[0] as [Transaction];
      expect(transaction.timeBounds).toEqual(EXPECTED_EXPLICIT);
      expect(transaction.operations).toHaveLength(1);
      expect(transaction.operations[0].type).toBe('changeTrust');
    });
  });

  describe('submitPayment', () => {
    it('applies the default expiry window when no bounds are given', async () => {
      await submitPayment({
        senderSecret: holder.secret(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
      });

      expect(submittedTimeBounds()).toEqual(DEFAULT_BOUNDS);
    });

    it('applies explicit bounds', async () => {
      await submitPayment({
        senderSecret: holder.secret(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
        timeBounds: EXPLICIT_BOUNDS,
      });

      expect(submittedTimeBounds()).toEqual(EXPECTED_EXPLICIT);
    });

    it('rejects a maxTime at or before minTime before reaching Horizon', async () => {
      await expect(
        submitPayment({
          senderSecret: holder.secret(),
          destinationPublicKey: destination,
          assetCode: 'XLM',
          assetIssuer: '',
          amount: '5',
          timeBounds: { minTime: at(600), maxTime: at(300) },
        })
      ).rejects.toThrow(/must be after minTime/);

      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  describe('buildUnsignedPayment', () => {
    function decodeBounds(xdr: string): Transaction['timeBounds'] {
      return new Transaction(xdr, Networks.TESTNET).timeBounds;
    }

    it('encodes the default expiry window into the returned XDR', async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: holder.publicKey(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
      });

      expect(decodeBounds(xdr)).toEqual(DEFAULT_BOUNDS);
    });

    it('encodes explicit bounds into the returned XDR', async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: holder.publicKey(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
        timeBounds: EXPLICIT_BOUNDS,
      });

      expect(decodeBounds(xdr)).toEqual(EXPECTED_EXPLICIT);
    });

    it('encodes an ISO 8601 maxTime, giving wallets a longer signing window', async () => {
      const deadline = new Date(at(3600) * 1000).toISOString();

      const xdr = await buildUnsignedPayment({
        senderPublicKey: holder.publicKey(),
        destinationPublicKey: destination,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '5',
        timeBounds: { maxTime: deadline },
      });

      expect(decodeBounds(xdr)).toEqual({ minTime: '0', maxTime: String(at(3600)) });
    });
  });
});
