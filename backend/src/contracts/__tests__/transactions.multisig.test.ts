import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { buildMultiSigPayment } from '../transactions';
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

const source = Keypair.random().publicKey();
const destination = Keypair.random().publicKey();
const assetIssuer = Keypair.random().publicKey();
const cosignerA = Keypair.random().publicKey();
const cosignerB = Keypair.random().publicKey();

interface AccountOptions {
  medThreshold?: number;
  signers?: Array<{ key: string; weight: number; type?: string }>;
}

/** Stand-in for Horizon's AccountResponse covering the fields the builder reads. */
function accountStub(options: AccountOptions = {}): unknown {
  const {
    medThreshold = 2,
    signers = [
      { key: source, weight: 1 },
      { key: cosignerA, weight: 1 },
      { key: cosignerB, weight: 1 },
    ],
  } = options;

  let sequence = 1n;
  return {
    accountId: () => source,
    sequenceNumber: () => sequence.toString(),
    incrementSequenceNumber: () => {
      sequence += 1n;
    },
    thresholds: { low_threshold: 1, med_threshold: medThreshold, high_threshold: 3 },
    signers: signers.map((signer) => ({ type: 'ed25519_public_key', ...signer })),
  };
}

const validParams = {
  sourcePublicKey: source,
  destinationPublicKey: destination,
  assetCode: 'ECO',
  assetIssuer,
  amount: '25.0000000',
};

describe('buildMultiSigPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadAccount.mockResolvedValue(accountStub());
  });

  describe('input validation', () => {
    it.each([
      [
        'a malformed source',
        { ...validParams, sourcePublicKey: 'GNOPE' },
        /sourcePublicKey is not a valid Stellar public key/,
      ],
      [
        'a malformed destination',
        { ...validParams, destinationPublicKey: 'GNOPE' },
        /destinationPublicKey is not a valid Stellar public key/,
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
      [
        'an issued asset with no issuer',
        { ...validParams, assetIssuer: undefined },
        /assetIssuer is required for any asset other than XLM/,
      ],
      [
        'a zero amount',
        { ...validParams, amount: '0' },
        /amount must be a positive decimal string/,
      ],
      [
        'an over-long memo',
        { ...validParams, memo: 'x'.repeat(29) },
        /memo must be 28 bytes or fewer/,
      ],
      [
        'a zero timeout',
        { ...validParams, timeoutSeconds: 0 },
        /timeoutSeconds must be a positive whole number/,
      ],
      [
        'a fractional timeout',
        { ...validParams, timeoutSeconds: 1.5 },
        /timeoutSeconds must be a positive whole number/,
      ],
    ])('rejects %s before calling Horizon', async (_case, params, expected) => {
      await expect(buildMultiSigPayment(params)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        httpStatus: 400,
        name: 'StellarError',
        status: 400,
        message: expect.stringMatching(expected) as unknown as string,
      });

      expect(mockLoadAccount).not.toHaveBeenCalled();
    });

    it('rejects a memo longer than 28 bytes before calling Horizon', async () => {
      await expect(
        buildMultiSigPayment({ ...validParams, memo: 'x'.repeat(29) })
      ).rejects.toMatchObject({ name: 'MemoValidationError' });

      expect(mockLoadAccount).not.toHaveBeenCalled();
    });

    it('does not require an issuer for XLM', async () => {
      await expect(
        buildMultiSigPayment({ ...validParams, assetCode: 'XLM', assetIssuer: undefined })
      ).resolves.toMatchObject({ requiredWeight: 2 });
    });
  });

  describe('the built envelope', () => {
    it('returns unsigned XDR carrying the payment', async () => {
      const result = await buildMultiSigPayment(validParams);

      const tx = new Transaction(result.xdr, Networks.TESTNET);
      expect(tx.signatures).toHaveLength(0);
      expect(tx.source).toBe(source);
      expect(tx.operations).toHaveLength(1);
      expect(tx.operations[0]).toMatchObject({
        type: 'payment',
        destination,
        amount: '25.0000000',
      });
      expect(result.networkPassphrase).toBe(Networks.TESTNET);
    });

    it('builds a native payment when the code is XLM', async () => {
      const result = await buildMultiSigPayment({
        ...validParams,
        assetCode: 'XLM',
        assetIssuer: undefined,
      });

      const tx = new Transaction(result.xdr, Networks.TESTNET);
      const [payment] = tx.operations as Array<{ asset: { isNative(): boolean } }>;
      expect(payment.asset.isNative()).toBe(true);
    });

    it('attaches a text memo when one is supplied', async () => {
      const result = await buildMultiSigPayment({ ...validParams, memo: 'payroll' });

      const tx = new Transaction(result.xdr, Networks.TESTNET);
      expect(tx.memo.value?.toString()).toBe('payroll');
    });

    it('honours a custom signature collection window', async () => {
      const result = await buildMultiSigPayment({ ...validParams, timeoutSeconds: 600 });

      const tx = new Transaction(result.xdr, Networks.TESTNET);
      const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
      expect(maxTime - Math.floor(Date.now() / 1000)).toBeGreaterThan(500);
    });
  });

  describe('N-of-M reporting', () => {
    it('reports 2-of-3 for three equal signers against a threshold of 2', async () => {
      const result = await buildMultiSigPayment(validParams);

      expect(result.requiredWeight).toBe(2);
      expect(result.availableWeight).toBe(3);
      expect(result.minimumSignatures).toBe(2);
      expect(result.signers).toHaveLength(3);
    });

    it('reports 1-of-3 when a single signer already carries the threshold', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub({
          medThreshold: 3,
          signers: [
            { key: source, weight: 3 },
            { key: cosignerA, weight: 1 },
            { key: cosignerB, weight: 1 },
          ],
        })
      );

      const result = await buildMultiSigPayment(validParams);

      expect(result.minimumSignatures).toBe(1);
      expect(result.signers[0]).toMatchObject({ key: source, weight: 3 });
    });

    it('orders signers by descending weight so the heaviest are signed first', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub({
          medThreshold: 4,
          signers: [
            { key: source, weight: 1 },
            { key: cosignerA, weight: 5 },
            { key: cosignerB, weight: 2 },
          ],
        })
      );

      const result = await buildMultiSigPayment(validParams);

      expect(result.signers.map((signer) => signer.weight)).toEqual([5, 2, 1]);
      expect(result.minimumSignatures).toBe(1);
    });

    it('excludes weight-zero signers, which can never contribute', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub({
          medThreshold: 2,
          signers: [
            { key: source, weight: 2 },
            { key: cosignerA, weight: 0 },
          ],
        })
      );

      const result = await buildMultiSigPayment(validParams);

      expect(result.signers).toHaveLength(1);
      expect(result.availableWeight).toBe(2);
    });

    it('reports zero required signatures when the threshold is zero', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub({ medThreshold: 0, signers: [{ key: source, weight: 1 }] })
      );

      const result = await buildMultiSigPayment(validParams);

      expect(result.requiredWeight).toBe(0);
      expect(result.minimumSignatures).toBe(0);
    });

    it('refuses to build when the signers cannot collectively reach the threshold', async () => {
      mockLoadAccount.mockResolvedValueOnce(
        accountStub({
          medThreshold: 10,
          signers: [
            { key: source, weight: 1 },
            { key: cosignerA, weight: 1 },
          ],
        })
      );

      await expect(buildMultiSigPayment(validParams)).rejects.toMatchObject({
        name: 'StellarOperationError',
        code: 'MISSING_SIGNATURES',
        httpStatus: 409,
        name: 'StellarError',
        status: 409,
        message: expect.stringContaining('combined signer weight of 2') as unknown as string,
      });
    });

    it('logs the signing requirement it derived', async () => {
      await buildMultiSigPayment(validParams);

      expect(logger.info).toHaveBeenCalledWith(
        'Built multi-signature payment',
        expect.objectContaining({
          requiredWeight: 2,
          availableWeight: 3,
          minimumSignatures: 2,
          totalSigners: 3,
        })
      );
    });
  });

  describe('Horizon failures', () => {
    it('maps a missing source account to ACCOUNT_NOT_FOUND', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 404 } });

      await expect(buildMultiSigPayment(validParams)).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_FOUND',
        httpStatus: 404,
      });
    });

    it('never surfaces the raw Horizon error and logs the mapped one', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 503 } });

      await expect(buildMultiSigPayment(validParams)).rejects.not.toHaveProperty('response');
    it('maps a missing source account to a 404', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 404 } });

      await expect(buildMultiSigPayment(validParams)).rejects.toMatchObject({
        name: 'StellarError',
        status: 404,
      });
    });

    it('maps an upstream failure to a 502 and logs it', async () => {
      mockLoadAccount.mockRejectedValueOnce({ response: { status: 503 } });

      await expect(buildMultiSigPayment(validParams)).rejects.toMatchObject({ status: 502 });
      expect(logger.error).toHaveBeenCalledWith(
        'Stellar operation failed',
        expect.objectContaining({
          operation: 'buildMultiSigPayment',
          code: 'HORIZON_UNAVAILABLE',
          status: 502,
        })
      );
    });
  });
});
