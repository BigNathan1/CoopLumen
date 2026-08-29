import { Keypair, Networks } from '@stellar/stellar-sdk';
import { issueAsset } from '../assets';
import { StellarService } from '../stellar';
import { SequenceCache } from '../sequenceCache';
import { invalidateBalanceCache } from '../../cache/balances';
import { logger } from '../../utils/logger';

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

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLoadAccount = StellarService.loadAccount as jest.Mock;
const mockSubmit = StellarService.submitTransaction as jest.Mock;
const mockInvalidate = invalidateBalanceCache as jest.Mock;

const issuerKeypair = Keypair.random();
const issuerSecret = issuerKeypair.secret();
const issuerPublicKey = issuerKeypair.publicKey();
const distributorPublicKey = Keypair.random().publicKey();

/**
 * Minimal stand-in for Horizon's AccountResponse. The sequence cache reads
 * `sequenceNumber()` from it and wraps the result in a real `Account`, so the
 * stub only has to answer that.
 */
function accountStub(publicKey: string, sequence = '1'): unknown {
  return {
    accountId: () => publicKey,
    sequenceNumber: () => sequence,
  };
}

function horizonFailure(resultCodes: { transaction?: string; operations?: string[] }): unknown {
  return {
    response: { status: 400, data: { extras: { result_codes: resultCodes } } },
  };
}

const validParams = {
  issuerSecret,
  assetCode: 'ECO',
  distributorPublicKey,
  amount: '1000.0000000',
};

describe('issueAsset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The sequence cache is process-wide; drop it so each test starts from a
    // fresh load rather than a neighbour's cached account.
    SequenceCache.invalidate(issuerPublicKey);
    mockLoadAccount.mockResolvedValue(accountStub(issuerPublicKey));
    mockSubmit.mockResolvedValue({ hash: 'TXHASH', ledger: 42 });
    mockInvalidate.mockResolvedValue(undefined);
  });

  describe('input validation', () => {
    it.each([
      [
        'a malformed issuer secret',
        { ...validParams, issuerSecret: 'not-a-secret' },
        /issuerSecret is not a valid Stellar secret key/,
      ],
      [
        'a non-alphanumeric asset code',
        { ...validParams, assetCode: 'ECO-1' },
        /assetCode must be 1-12 alphanumeric characters/,
      ],
      [
        'an asset code longer than 12 characters',
        { ...validParams, assetCode: 'THIRTEENCHARS' },
        /assetCode must be 1-12 alphanumeric characters/,
      ],
      [
        'a malformed distributor key',
        { ...validParams, distributorPublicKey: 'GNOPE' },
        /distributorPublicKey is not a valid Stellar public key/,
      ],
      [
        'a distributor equal to the issuer',
        { ...validParams, distributorPublicKey: issuerPublicKey },
        /must differ from the issuing account/,
      ],
      ['a zero amount', { ...validParams, amount: '0' }, /amount must be a positive decimal/],
      [
        'an amount with more than 7 decimals',
        { ...validParams, amount: '1.12345678' },
        /amount must be a positive decimal/,
      ],
      [
        'a non-numeric amount',
        { ...validParams, amount: '10 ECO' },
        /amount must be a positive decimal/,
      ],
      [
        'a memo longer than 28 bytes',
        { ...validParams, memo: 'x'.repeat(29) },
        /memo must be 28 bytes or fewer/,
      ],
      [
        'a multi-byte memo longer than 28 bytes',
        { ...validParams, memo: 'é'.repeat(15) },
        /memo must be 28 bytes or fewer/,
      ],
    ])('rejects %s before calling Horizon', async (_case, params, expected) => {
      await expect(issueAsset(params)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        httpStatus: 400,
        message: expect.stringMatching(expected) as unknown as string,
      });

      expect(mockLoadAccount).not.toHaveBeenCalled();
      expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('accepts a 28-byte memo', async () => {
      await expect(issueAsset({ ...validParams, memo: 'x'.repeat(28) })).resolves.toBe('TXHASH');
    });
  });

  describe('successful issuance', () => {
    it('submits a payment of the asset from the issuer to the distributor', async () => {
      const hash = await issueAsset(validParams);

      expect(hash).toBe('TXHASH');
      expect(mockLoadAccount).toHaveBeenCalledWith(issuerPublicKey);

      const submitted = mockSubmit.mock.calls[0][0];
      expect(submitted.networkPassphrase).toBe(Networks.TESTNET);
      expect(submitted.operations).toHaveLength(1);
      expect(submitted.operations[0]).toMatchObject({
        type: 'payment',
        destination: distributorPublicKey,
        amount: '1000.0000000',
      });
      expect(submitted.operations[0].asset.getCode()).toBe('ECO');
      expect(submitted.operations[0].asset.getIssuer()).toBe(issuerPublicKey);
      expect(submitted.signatures).toHaveLength(1);
    });

    it('attaches a text memo when one is supplied', async () => {
      await issueAsset({ ...validParams, memo: 'seed round' });

      const submitted = mockSubmit.mock.calls[0][0];
      expect(submitted.memo.value.toString()).toBe('seed round');
    });

    it('invalidates the cached balances of both accounts', async () => {
      await issueAsset(validParams);

      expect(mockInvalidate).toHaveBeenCalledWith([issuerPublicKey, distributorPublicKey]);
    });

    it('logs the attempt and the result without ever logging the secret', async () => {
      await issueAsset(validParams);

      const logged = JSON.stringify((logger.info as jest.Mock).mock.calls);
      expect(logged).not.toContain(issuerSecret);
      expect(logger.info).toHaveBeenCalledWith(
        'Issuing community token',
        expect.objectContaining({ assetCode: 'ECO', issuerPublicKey, amount: '1000.0000000' })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Community token issued',
        expect.objectContaining({ txHash: 'TXHASH', ledger: 42 })
      );
    });

    it('still returns the hash when cache invalidation fails', async () => {
      mockInvalidate.mockRejectedValueOnce(new Error('redis down'));

      await expect(issueAsset(validParams)).resolves.toBe('TXHASH');
      expect(logger.warn).toHaveBeenCalledWith(
        'Balance cache invalidation failed after issuance',
        expect.objectContaining({ txHash: 'TXHASH', error: 'redis down' })
      );
    });
  });

  describe('Horizon failures', () => {
    it('maps a missing distributor trustline to an actionable message', async () => {
      mockSubmit.mockRejectedValueOnce(horizonFailure({ operations: ['op_no_trust'] }));

      await expect(issueAsset(validParams)).rejects.toMatchObject({
        name: 'StellarOperationError',
        operation: 'issueAsset',
        code: 'TRUSTLINE_MISSING',
        httpStatus: 422,
      });
    });

    it('maps a full trustline to TRUSTLINE_LIMIT_EXCEEDED', async () => {
      mockSubmit.mockRejectedValueOnce(horizonFailure({ operations: ['op_line_full'] }));

      await expect(issueAsset(validParams)).rejects.toMatchObject({
        code: 'TRUSTLINE_LIMIT_EXCEEDED',
      });
    });

    it('retries a single stale sequence number rather than failing', async () => {
      // withSequenceRetry reloads the account and retries once on tx_bad_seq.
      mockSubmit.mockRejectedValueOnce(horizonFailure({ transaction: 'tx_bad_seq' }));

      await expect(issueAsset(validParams)).resolves.toBe('TXHASH');
      expect(mockSubmit).toHaveBeenCalledTimes(2);
    });

    it('maps a stale sequence number to BAD_SEQUENCE once the retry is exhausted', async () => {
      mockSubmit
        .mockRejectedValueOnce(horizonFailure({ transaction: 'tx_bad_seq' }))
        .mockRejectedValueOnce(horizonFailure({ transaction: 'tx_bad_seq' }));

      await expect(issueAsset(validParams)).rejects.toMatchObject({
        code: 'BAD_SEQUENCE',
        httpStatus: 409,
      });
    });

    it('maps an unfunded issuer account to ACCOUNT_NOT_FOUND', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 404 } });

      await expect(issueAsset(validParams)).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_FOUND',
        httpStatus: 404,
      });
      expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('never surfaces the raw Horizon error and logs the mapped one', async () => {
      mockSubmit.mockRejectedValueOnce(horizonFailure({ operations: ['op_underfunded'] }));

      await expect(issueAsset(validParams)).rejects.not.toHaveProperty('response');
      expect(logger.error).toHaveBeenCalledWith(
        'Stellar operation failed',
        expect.objectContaining({ operation: 'issueAsset', code: 'INSUFFICIENT_BALANCE' })
      );
    });
  });
});
