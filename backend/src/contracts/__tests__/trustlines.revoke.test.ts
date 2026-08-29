import { Keypair, Networks } from '@stellar/stellar-sdk';
import { revokeTrustline } from '../trustlines';
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

const holder = Keypair.random();
const publicKey = holder.publicKey();
const assetIssuer = Keypair.random().publicKey();

interface BalanceLineOverrides {
  balance?: string;
  selling_liabilities?: string;
  buying_liabilities?: string;
  asset_code?: string;
  asset_issuer?: string;
}

function trustlineBalance(overrides: BalanceLineOverrides = {}): unknown {
  return {
    asset_type: 'credit_alphanum4',
    asset_code: 'ECO',
    asset_issuer: assetIssuer,
    balance: '0.0000000',
    limit: '1000.0000000',
    selling_liabilities: '0.0000000',
    buying_liabilities: '0.0000000',
    ...overrides,
  };
}

/**
 * Minimal stand-in for Horizon's AccountResponse. The pre-flight checks read
 * `balances`; the sequence cache reads `sequenceNumber()` and wraps it in a
 * real `Account` for the build.
 */
function accountStub(balances: unknown[]): unknown {
  return {
    balances,
    accountId: () => publicKey,
    sequenceNumber: () => '1',
  };
}

function horizonFailure(resultCodes: { transaction?: string; operations?: string[] }): unknown {
  return { response: { status: 400, data: { extras: { result_codes: resultCodes } } } };
}

const validParams = {
  accountSecret: holder.secret(),
  assetCode: 'ECO',
  assetIssuer,
};

describe('revokeTrustline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The sequence cache is process-wide; drop it so each test starts from a
    // fresh load rather than a neighbour's cached account.
    SequenceCache.invalidate(publicKey);
    mockLoadAccount.mockResolvedValue(
      accountStub([{ asset_type: 'native', balance: '100.0000000' }, trustlineBalance()])
    );
    mockSubmit.mockResolvedValue({ hash: 'REVOKEHASH', ledger: 7 });
    mockInvalidate.mockResolvedValue(undefined);
  });

  describe('input validation', () => {
    it.each([
      [
        'a malformed account secret',
        { ...validParams, accountSecret: 'nope' },
        /accountSecret is not a valid Stellar secret key/,
      ],
      [
        'a malformed asset code',
        { ...validParams, assetCode: 'ECO!' },
        /assetCode must be 1-12 alphanumeric characters/,
      ],
      [
        'a malformed issuer',
        { ...validParams, assetIssuer: 'GNOPE' },
        /assetIssuer is not a valid Stellar public key/,
      ],
    ])('rejects %s before calling Horizon', async (_case, params, expected) => {
      await expect(revokeTrustline(params)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        httpStatus: 400,
        message: expect.stringMatching(expected) as unknown as string,
      });

      expect(mockLoadAccount).not.toHaveBeenCalled();
      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  describe('pre-flight checks', () => {
    it('reports a missing trustline as 404 without submitting', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([{ asset_type: 'native', balance: '100.0000000' }])
      );

      await expect(revokeTrustline(validParams)).rejects.toMatchObject({
        name: 'StellarOperationError',
        code: 'TRUSTLINE_MISSING',
        httpStatus: 404,
        message: expect.stringContaining('nothing to revoke') as unknown as string,
      });

      expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('does not treat a same-code trustline from another issuer as a match', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ asset_issuer: Keypair.random().publicKey() })])
      );

      await expect(revokeTrustline(validParams)).rejects.toMatchObject({
        code: 'TRUSTLINE_MISSING',
      });
    });

    it('refuses to revoke a trustline that still holds a balance, naming the amount', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ balance: '42.5000000' })])
      );

      await expect(revokeTrustline(validParams)).rejects.toMatchObject({
        code: 'TRUSTLINE_HAS_BALANCE',
        httpStatus: 409,
        message: expect.stringContaining('42.5000000 ECO') as unknown as string,
      });

      expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('refuses to revoke a trustline with open selling liabilities', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ selling_liabilities: '5.0000000' })])
      );

      await expect(revokeTrustline(validParams)).rejects.toMatchObject({
        code: 'TRUSTLINE_HAS_BALANCE',
        httpStatus: 409,
        message: expect.stringContaining('open liabilities') as unknown as string,
      });

      expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('refuses to revoke a trustline with open buying liabilities', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ buying_liabilities: '5.0000000' })])
      );

      await expect(revokeTrustline(validParams)).rejects.toMatchObject({
        code: 'TRUSTLINE_HAS_BALANCE',
      });
    });

    it('proceeds when Horizon omits the liability fields entirely', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'ECO',
            asset_issuer: assetIssuer,
            balance: '0.0000000',
          },
        ])
      );

      await expect(revokeTrustline(validParams)).resolves.toBe('REVOKEHASH');
    });
  });

  describe('successful revocation', () => {
    it('submits a changeTrust with a zero limit signed by the account', async () => {
      const hash = await revokeTrustline(validParams);

      expect(hash).toBe('REVOKEHASH');
      expect(mockLoadAccount).toHaveBeenCalledWith(publicKey);

      const submitted = mockSubmit.mock.calls[0][0];
      expect(submitted.networkPassphrase).toBe(Networks.TESTNET);
      expect(submitted.operations).toHaveLength(1);
      expect(submitted.operations[0]).toMatchObject({
        type: 'changeTrust',
        limit: '0.0000000',
      });
      expect(submitted.operations[0].line.getCode()).toBe('ECO');
      expect(submitted.operations[0].line.getIssuer()).toBe(assetIssuer);
      expect(submitted.signatures).toHaveLength(1);
    });

    it('invalidates the cached balance of the revoking account', async () => {
      await revokeTrustline(validParams);

      expect(mockInvalidate).toHaveBeenCalledWith([publicKey]);
    });

    it('logs the attempt and result without logging the account secret', async () => {
      await revokeTrustline(validParams);

      const logged = JSON.stringify((logger.info as jest.Mock).mock.calls);
      expect(logged).not.toContain(holder.secret());
      expect(logger.info).toHaveBeenCalledWith(
        'Trustline revoked',
        expect.objectContaining({ txHash: 'REVOKEHASH', ledger: 7 })
      );
    });

    it('still returns the hash when cache invalidation fails', async () => {
      mockInvalidate.mockRejectedValueOnce(new Error('redis down'));

      await expect(revokeTrustline(validParams)).resolves.toBe('REVOKEHASH');
      expect(logger.warn).toHaveBeenCalledWith(
        'Balance cache invalidation failed after trustline revocation',
        expect.objectContaining({ txHash: 'REVOKEHASH', error: 'redis down' })
      );
    });
  });

  describe('Horizon failures', () => {
    it('maps an unfunded account to ACCOUNT_NOT_FOUND', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 404 } });

      await expect(revokeTrustline(validParams)).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_FOUND',
        httpStatus: 404,
      });
    });

    it('maps a racing op_invalid_limit to TRUSTLINE_HAS_BALANCE', async () => {
      mockSubmit.mockRejectedValueOnce(horizonFailure({ operations: ['op_invalid_limit'] }));

      await expect(revokeTrustline(validParams)).rejects.toMatchObject({
        code: 'TRUSTLINE_HAS_BALANCE',
        httpStatus: 409,
      });
    });

    it('retries a single stale sequence number rather than failing', async () => {
      // withSequenceRetry reloads the account and retries once on tx_bad_seq.
      mockSubmit.mockRejectedValueOnce(horizonFailure({ transaction: 'tx_bad_seq' }));

      await expect(revokeTrustline(validParams)).resolves.toBe('REVOKEHASH');
      expect(mockSubmit).toHaveBeenCalledTimes(2);
    });

    it('maps a stale sequence number to BAD_SEQUENCE once the retry is exhausted', async () => {
      mockSubmit
        .mockRejectedValueOnce(horizonFailure({ transaction: 'tx_bad_seq' }))
        .mockRejectedValueOnce(horizonFailure({ transaction: 'tx_bad_seq' }));

      await expect(revokeTrustline(validParams)).rejects.toMatchObject({
        code: 'BAD_SEQUENCE',
        httpStatus: 409,
      });
    });

    it('never surfaces the raw Horizon error and logs the mapped one', async () => {
      mockSubmit.mockRejectedValueOnce(horizonFailure({ transaction: 'tx_insufficient_fee' }));

      await expect(revokeTrustline(validParams)).rejects.not.toHaveProperty('response');
      expect(logger.error).toHaveBeenCalledWith(
        'Stellar operation failed',
        expect.objectContaining({ operation: 'revokeTrustline', code: 'INSUFFICIENT_FEE' })
      );
    });
  });
});
