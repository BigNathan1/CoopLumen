import { Account, Keypair, Transaction } from '@stellar/stellar-sdk';
import { issueAsset, burnAsset, getAssetHolders, getAssetBalance, getTotalSupply } from '../assets';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
    call: jest.fn((_operationName: string, request: () => unknown) => request()),
  },
}));

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

describe('assets.ts comprehensive unit tests (mock Horizon)', () => {
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;
  const mockSubmitTransaction = StellarService.submitTransaction as jest.Mock;
  const mockGetServer = StellarService.getServer as jest.Mock;
  const mockCall = StellarService.call as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('issueAsset', () => {
    it('successfully issues an asset and returns transaction hash', async () => {
      const issuer = Keypair.random();
      const distributorPubKey = Keypair.random().publicKey();

      mockLoadAccount.mockResolvedValueOnce(new Account(issuer.publicKey(), '100'));
      mockSubmitTransaction.mockResolvedValueOnce({ hash: 'issue-tx-hash-123' });

      const hash = await issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: 'ECO',
        distributorPublicKey: distributorPubKey,
        amount: '1000.0000000',
        memo: 'airdrop distribution',
      });

      expect(hash).toBe('issue-tx-hash-123');
      expect(mockLoadAccount).toHaveBeenCalledWith(issuer.publicKey());
      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);

      const submittedTx = mockSubmitTransaction.mock.calls[0][0] as Transaction;
      expect(submittedTx.operations).toHaveLength(1);
      expect(submittedTx.operations[0].type).toBe('payment');
      expect((submittedTx.operations[0] as any).destination).toBe(distributorPubKey);
      expect((submittedTx.operations[0] as any).amount).toBe('1000.0000000');
      expect((submittedTx.operations[0] as any).asset.getCode()).toBe('ECO');
      expect((submittedTx.operations[0] as any).asset.getIssuer()).toBe(issuer.publicKey());
    });

    it('handles optional timeBounds and memo correctly', async () => {
      const issuer = Keypair.random();
      const distributorPubKey = Keypair.random().publicKey();

      mockLoadAccount.mockResolvedValueOnce(new Account(issuer.publicKey(), '5'));
      mockSubmitTransaction.mockResolvedValueOnce({ hash: 'issue-bounds-hash' });

      const hash = await issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: 'ECO',
        distributorPublicKey,
        amount: '50',
        timeBounds: { minTime: 100, maxTime: 200 },
      });

      expect(hash).toBe('issue-bounds-hash');
      const submittedTx = mockSubmitTransaction.mock.calls[0][0] as Transaction;
      expect(submittedTx.timeBounds).toEqual({ minTime: '100', maxTime: '200' });
    });

    it('propagates submission errors when issuer account does not exist or has bad sequence', async () => {
      const issuer = Keypair.random();
      const distributorPubKey = Keypair.random().publicKey();

      mockLoadAccount.mockResolvedValueOnce(new Account(issuer.publicKey(), '1'));
      const horizonError = { response: { status: 400, data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } } };
      mockSubmitTransaction.mockRejectedValueOnce(horizonError);

      await expect(
        issueAsset({
          issuerSecret: issuer.secret(),
          assetCode: 'ECO',
          distributorPublicKey,
          amount: '10',
        })
      ).rejects.toEqual(horizonError);
    });
  });

  describe('burnAsset', () => {
    it('successfully burns an asset by sending it back to issuer and returns hash', async () => {
      const holder = Keypair.random();
      const issuerPubKey = Keypair.random().publicKey();

      mockLoadAccount.mockResolvedValueOnce(new Account(holder.publicKey(), '42'));
      mockSubmitTransaction.mockResolvedValueOnce({ hash: 'burn-tx-hash-456' });

      const hash = await burnAsset({
        holderSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: issuerPubKey,
        amount: '25.5000000',
        memo: 'burning tokens',
      });

      expect(hash).toBe('burn-tx-hash-456');
      expect(mockLoadAccount).toHaveBeenCalledWith(holder.publicKey());
      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);

      const submittedTx = mockSubmitTransaction.mock.calls[0][0] as Transaction;
      expect(submittedTx.operations).toHaveLength(1);
      expect(submittedTx.operations[0].type).toBe('payment');
      expect((submittedTx.operations[0] as any).destination).toBe(issuerPubKey);
      expect((submittedTx.operations[0] as any).amount).toBe('25.5000000');
      expect((submittedTx.operations[0] as any).asset.getCode()).toBe('ECO');
    });

    it('propagates errors on burn failure (e.g. op_underfunded)', async () => {
      const holder = Keypair.random();
      const issuerPubKey = Keypair.random().publicKey();

      mockLoadAccount.mockResolvedValueOnce(new Account(holder.publicKey(), '10'));
      const error = { response: { status: 400, data: { extras: { result_codes: { operations: ['op_underfunded'] } } } } };
      mockSubmitTransaction.mockRejectedValueOnce(error);

      await expect(
        burnAsset({
          holderSecret: holder.secret(),
          assetCode: 'ECO',
          assetIssuer: issuerPubKey,
          amount: '99999',
        })
      ).rejects.toEqual(error);
    });
  });

  describe('getAssetHolders', () => {
    it('paginates and returns all accounts holding the specified asset', async () => {
      const issuerPubKey = Keypair.random().publicKey();
      const holder1 = Keypair.random().publicKey();
      const holder2 = Keypair.random().publicKey();

      const mockAccountsEndpoint = {
        forAsset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValueOnce({
          records: [
            {
              account_id: holder1,
              balances: [
                { asset_type: 'native', balance: '10.0' },
                {
                  asset_type: 'credit_alphanum4',
                  asset_code: 'ECO',
                  asset_issuer: issuerPubKey,
                  balance: '150.0000000',
                },
              ],
            },
            {
              account_id: Keypair.random().publicKey(),
              balances: [{ asset_type: 'native', balance: '5.0' }], // No trustline / holding for ECO
            },
            {
              account_id: holder2,
              balances: [
                {
                  asset_type: 'credit_alphanum4',
                  asset_code: 'ECO',
                  asset_issuer: issuerPubKey,
                  balance: '75.2500000',
                },
              ],
            },
          ],
        }),
      };

      mockGetServer.mockReturnValue({
        accounts: () => mockAccountsEndpoint,
      });

      const holders = await getAssetHolders('ECO', issuerPubKey);

      expect(holders).toEqual([
        { account: holder1, balance: '150.0000000' },
        { account: holder2, balance: '75.2500000' },
      ]);
      expect(mockAccountsEndpoint.forAsset).toHaveBeenCalled();
      expect(mockAccountsEndpoint.limit).toHaveBeenCalledWith(200);
    });

    it('handles empty results when no accounts hold the asset', async () => {
      const issuerPubKey = Keypair.random().publicKey();

      const mockAccountsEndpoint = {
        forAsset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValueOnce({
          records: [],
        }),
      };

      mockGetServer.mockReturnValue({
        accounts: () => mockAccountsEndpoint,
      });

      const holders = await getAssetHolders('ECO', issuerPubKey);
      expect(holders).toEqual([]);
    });
  });

  describe('getAssetBalance', () => {
    it('returns balance when account holds the asset', async () => {
      const pubKey = Keypair.random().publicKey();
      const issuer = Keypair.random().publicKey();

      mockLoadAccount.mockResolvedValueOnce({
        account_id: pubKey,
        balances: [
          { asset_type: 'native', balance: '100.0' },
          { asset_type: 'credit_alphanum4', asset_code: 'ECO', asset_issuer: issuer, balance: '42.5' },
        ],
      });

      const balance = await getAssetBalance(pubKey, 'ECO', issuer);
      expect(balance).toBe(42.5);
    });

    it('returns 0 when account has no trustline', async () => {
      const pubKey = Keypair.random().publicKey();
      const issuer = Keypair.random().publicKey();

      mockLoadAccount.mockResolvedValueOnce({
        account_id: pubKey,
        balances: [{ asset_type: 'native', balance: '100.0' }],
      });

      const balance = await getAssetBalance(pubKey, 'ECO', issuer);
      expect(balance).toBe(0);
    });
  });

  describe('getTotalSupply', () => {
    it('returns the total supply reported by Horizon asset endpoint', async () => {
      const issuer = Keypair.random().publicKey();
      const limitCall = jest.fn().mockResolvedValue({ records: [{ amount: '12345.6789000' }] });
      const forIssuer = jest.fn().mockReturnValue({ limit: limitCall });
      const forCode = jest.fn().mockReturnValue({ forIssuer });

      mockGetServer.mockReturnValue({
        assets: () => ({ forCode }),
      });

      const supply = await getTotalSupply('ECO', issuer);
      expect(supply).toBe('12345.6789000');
      expect(forCode).toHaveBeenCalledWith('ECO');
      expect(forIssuer).toHaveBeenCalledWith(issuer);
    });

    it('returns zero supply string when no asset record exists', async () => {
      const issuer = Keypair.random().publicKey();
      const limitCall = jest.fn().mockResolvedValue({ records: [] });
      const forIssuer = jest.fn().mockReturnValue({ limit: limitCall });
      const forCode = jest.fn().mockReturnValue({ forIssuer });

      mockGetServer.mockReturnValue({
        assets: () => ({ forCode }),
      });

      const supply = await getTotalSupply('ECO', issuer);
      expect(supply).toBe('0.0000000');
    });
  });
});
