import { Account, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { establishTrustline, buildUnsignedTrustline, hasTrustline, setTrustlineFlags } from '../trustlines';
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

const accountKeypair = Keypair.random();
const issuerKeypair = Keypair.random();

beforeEach(() => {
  mockLoadAccount.mockReset();
  mockSubmit.mockReset();
  mockLoadAccount.mockImplementation((publicKey: string) =>
    Promise.resolve(new Account(publicKey, '1'))
  );
  mockSubmit.mockResolvedValue({ hash: 'trustlinehash123' });
});

describe('trustlines contract wrapper', () => {
  describe('establishTrustline', () => {
    it('successfully establishes a trustline with default limit and returns hash', async () => {
      const hash = await establishTrustline({
        accountSecret: accountKeypair.secret(),
        assetCode: 'ECO',
        assetIssuer: issuerKeypair.publicKey(),
      });

      expect(hash).toBe('trustlinehash123');
      expect(mockLoadAccount).toHaveBeenCalledWith(accountKeypair.publicKey());
      expect(mockSubmit).toHaveBeenCalledTimes(1);

      const [tx] = mockSubmit.mock.calls[0] as [Transaction];
      expect(tx.operations).toHaveLength(1);
      expect(tx.operations[0].type).toBe('changeTrust');
    });

    it('establishes a trustline with an explicit limit', async () => {
      const hash = await establishTrustline({
        accountSecret: accountKeypair.secret(),
        assetCode: 'ECO',
        assetIssuer: issuerKeypair.publicKey(),
        limit: '10000',
      });

      expect(hash).toBe('trustlinehash123');
      const [tx] = mockSubmit.mock.calls[0] as [Transaction];
      expect((tx.operations[0] as any).limit).toBe('10000.0000000');
    });

    it('includes a memo and time bounds when provided', async () => {
      const hash = await establishTrustline({
        accountSecret: accountKeypair.secret(),
        assetCode: 'ECO',
        assetIssuer: issuerKeypair.publicKey(),
        memo: 'trust eco',
        timeBounds: { minTime: 1_800_000_000, maxTime: 1_900_000_000 },
      });

      expect(hash).toBe('trustlinehash123');
      const [tx] = mockSubmit.mock.calls[0] as [Transaction];
      expect(tx.memo.type).toBe('text');
      expect(tx.timeBounds).toEqual({ minTime: '1800000000', maxTime: '1900000000' });
    });

    it('propagates Horizon submission errors', async () => {
      // withSequenceRetry retries once on tx_bad_seq only; any other mapped
      // failure (like op_low_reserve here) is not retried, so a single
      // rejection is enough for this one. establishTrustline doesn't wrap
      // the raw Horizon rejection in an Error, so assert on the value
      // itself rather than .toThrow(), which expects an Error instance.
      const horizonError = {
        response: {
          status: 400,
          data: { extras: { result_codes: { transaction: 'tx_failed', operations: ['op_low_reserve'] } } },
        },
      };
      mockSubmit.mockRejectedValueOnce(horizonError);

      await expect(
        establishTrustline({
          accountSecret: accountKeypair.secret(),
          assetCode: 'ECO',
          assetIssuer: issuerKeypair.publicKey(),
        })
      ).rejects.toEqual(horizonError);
    });
  });

  describe('buildUnsignedTrustline', () => {
    it('builds an unsigned XDR string for changeTrust', async () => {
      const xdr = await buildUnsignedTrustline({
        accountPublicKey: accountKeypair.publicKey(),
        assetCode: 'ECO',
        assetIssuer: issuerKeypair.publicKey(),
        limit: '5000',
      });

      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);

      const tx = new Transaction(xdr, Networks.TESTNET);
      expect(tx.operations).toHaveLength(1);
      expect(tx.operations[0].type).toBe('changeTrust');
      expect((tx.operations[0] as any).limit).toBe('5000.0000000');
    });
  });

  describe('hasTrustline', () => {
    it('returns true when account holds a balance line for the asset', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        balances: [
          { asset_type: 'native', balance: '10' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'ECO',
            asset_issuer: issuerKeypair.publicKey(),
            balance: '0',
          },
        ],
      });

      const exists = await hasTrustline(accountKeypair.publicKey(), 'ECO', issuerKeypair.publicKey());
      expect(exists).toBe(true);
    });

    it('returns false when account has no matching trustline', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        balances: [{ asset_type: 'native', balance: '10' }],
      });

      const exists = await hasTrustline(accountKeypair.publicKey(), 'ECO', issuerKeypair.publicKey());
      expect(exists).toBe(false);
    });
  });

  describe('setTrustlineFlags', () => {
    it('sets authorization flags on a trustline successfully', async () => {
      mockSubmit.mockResolvedValueOnce({ hash: 'flagshash' });

      const hash = await setTrustlineFlags({
        issuerSecret: issuerKeypair.secret(),
        trustorPublicKey: accountKeypair.publicKey(),
        assetCode: 'ECO',
        flags: {
          authorized: true,
          clawbackEnabled: false,
        },
      });

      expect(hash).toBe('flagshash');
      const [tx] = mockSubmit.mock.calls[0] as [Transaction];
      expect(tx.operations).toHaveLength(1);
      expect(tx.operations[0].type).toBe('setTrustLineFlags');
    });

    it('throws StellarError when setting flags with invalid issuer or parameters', async () => {
      await expect(
        setTrustlineFlags({
          issuerSecret: 'invalid-secret',
          trustorPublicKey: accountKeypair.publicKey(),
          assetCode: 'ECO',
          flags: { authorized: true },
        })
      ).rejects.toThrow();
    });
  });
});
