import { Keypair } from '@stellar/stellar-sdk';
import { getTrustlineLimit } from '../trustlines';
import { StellarService } from '../stellar';
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
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockLoadAccount = StellarService.loadAccount as jest.Mock;

const publicKey = Keypair.random().publicKey();
const assetIssuer = Keypair.random().publicKey();

interface BalanceOverrides {
  balance?: string;
  limit?: string;
  asset_code?: string;
  asset_issuer?: string;
  asset_type?: string;
  is_authorized?: boolean;
}

function trustlineBalance(overrides: BalanceOverrides = {}): unknown {
  return {
    asset_type: 'credit_alphanum4',
    asset_code: 'ECO',
    asset_issuer: assetIssuer,
    balance: '100.0000000',
    limit: '1000.0000000',
    is_authorized: true,
    ...overrides,
  };
}

function accountStub(balances: unknown[]): unknown {
  return { balances };
}

describe('getTrustlineLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadAccount.mockResolvedValue(
      accountStub([{ asset_type: 'native', balance: '50.0000000' }, trustlineBalance()])
    );
  });

  describe('input validation', () => {
    it.each([
      ['a malformed account key', 'GNOPE', 'ECO', assetIssuer, /publicKey is not a valid/],
      [
        'a malformed asset code',
        publicKey,
        'ECO!',
        assetIssuer,
        /assetCode must be 1-12 alphanumeric characters/,
      ],
      [
        'a malformed issuer',
        publicKey,
        'ECO',
        'GNOPE',
        /assetIssuer is not a valid Stellar public key/,
      ],
    ])('rejects %s before calling Horizon', async (_case, account, assetCode, issuer, expected) => {
      await expect(getTrustlineLimit(account, assetCode, issuer)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        httpStatus: 400,
        message: expect.stringMatching(expected) as unknown as string,
      });

      expect(mockLoadAccount).not.toHaveBeenCalled();
    });
  });

  describe('reading the limit', () => {
    it('returns the configured limit with the balance and remaining headroom', async () => {
      const result = await getTrustlineLimit(publicKey, 'ECO', assetIssuer);

      expect(mockLoadAccount).toHaveBeenCalledWith(publicKey);
      expect(result).toEqual({
        limit: '1000.0000000',
        balance: '100.0000000',
        available: '900.0000000',
        isAuthorized: true,
      });
    });

    it('computes headroom at full stroop precision', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ limit: '0.0000003', balance: '0.0000001' })])
      );

      const result = await getTrustlineLimit(publicKey, 'ECO', assetIssuer);

      expect(result?.available).toBe('0.0000002');
    });

    it('does not drift on amounts a float would round', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ limit: '922337203685.4775807', balance: '0.1000000' })])
      );

      const result = await getTrustlineLimit(publicKey, 'ECO', assetIssuer);

      expect(result?.available).toBe('922337203685.3775807');
    });

    it('reports negative headroom when the balance exceeds a lowered limit', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ limit: '10.0000000', balance: '25.5000000' })])
      );

      const result = await getTrustlineLimit(publicKey, 'ECO', assetIssuer);

      expect(result?.available).toBe('-15.5000000');
    });

    it('reads a 12-character asset code', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([
          trustlineBalance({ asset_type: 'credit_alphanum12', asset_code: 'COMMUNITYTOK' }),
        ])
      );

      const result = await getTrustlineLimit(publicKey, 'COMMUNITYTOK', assetIssuer);

      expect(result?.limit).toBe('1000.0000000');
    });

    it('treats an omitted is_authorized as authorized', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'ECO',
            asset_issuer: assetIssuer,
            balance: '5.0000000',
            limit: '10.0000000',
          },
        ])
      );

      expect((await getTrustlineLimit(publicKey, 'ECO', assetIssuer))?.isAuthorized).toBe(true);
    });

    it('reports a frozen trustline as unauthorized', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ is_authorized: false })])
      );

      expect((await getTrustlineLimit(publicKey, 'ECO', assetIssuer))?.isAuthorized).toBe(false);
    });
  });

  describe('absent trustlines', () => {
    it('returns null when the account trusts nothing but XLM', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([{ asset_type: 'native', balance: '50.0000000' }])
      );

      expect(await getTrustlineLimit(publicKey, 'ECO', assetIssuer)).toBeNull();
    });

    it('returns null for the same code from a different issuer', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ asset_issuer: Keypair.random().publicKey() })])
      );

      expect(await getTrustlineLimit(publicKey, 'ECO', assetIssuer)).toBeNull();
    });

    it('returns null for a different code from the same issuer', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([trustlineBalance({ asset_code: 'AGRI' })])
      );

      expect(await getTrustlineLimit(publicKey, 'ECO', assetIssuer)).toBeNull();
    });

    it('ignores liquidity pool shares, which carry no asset code', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub([
          { asset_type: 'liquidity_pool_shares', balance: '1.0000000', liquidity_pool_id: 'abc' },
        ])
      );

      expect(await getTrustlineLimit(publicKey, 'ECO', assetIssuer)).toBeNull();
    });
  });

  describe('Horizon failures', () => {
    it('maps a missing account to ACCOUNT_NOT_FOUND rather than returning null', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 404 } });

      await expect(getTrustlineLimit(publicKey, 'ECO', assetIssuer)).rejects.toMatchObject({
        name: 'StellarOperationError',
        code: 'ACCOUNT_NOT_FOUND',
        httpStatus: 404,
      });
    });

    it('maps a rate-limited read to RATE_LIMITED', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 429 } });

      await expect(getTrustlineLimit(publicKey, 'ECO', assetIssuer)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });

    it('never surfaces the raw Horizon error and logs the mapped one', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 503 } });

      await expect(getTrustlineLimit(publicKey, 'ECO', assetIssuer)).rejects.not.toHaveProperty(
        'response'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Stellar operation failed',
        expect.objectContaining({ operation: 'getTrustlineLimit', code: 'HORIZON_UNAVAILABLE' })
      );
    });
  });
});
