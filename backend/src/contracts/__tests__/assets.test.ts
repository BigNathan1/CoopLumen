import { Account, Keypair } from '@stellar/stellar-sdk';
import { burnAsset, getTotalSupply } from '../assets';
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

describe('burnAsset', () => {
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;
  const mockSubmitTransaction = StellarService.submitTransaction as jest.Mock;

  beforeEach(() => {
    mockLoadAccount.mockReset();
    mockSubmitTransaction.mockReset();
  });

  it('sends the burn amount back to the issuer and returns the tx hash', async () => {
    const holder = Keypair.random();
    const issuer = Keypair.random().publicKey();

    mockLoadAccount.mockResolvedValueOnce(new Account(holder.publicKey(), '1'));
    mockSubmitTransaction.mockResolvedValueOnce({ hash: 'burn-tx-hash' });

    const hash = await burnAsset({
      holderSecret: holder.secret(),
      assetCode: 'ECO',
      assetIssuer: issuer,
      amount: '10',
    });

    expect(hash).toBe('burn-tx-hash');
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);

    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    expect(submittedTx.operations).toHaveLength(1);
    expect(submittedTx.operations[0].type).toBe('payment');
    expect(submittedTx.operations[0].destination).toBe(issuer);
  });

  it('propagates a Horizon submission failure without swallowing it', async () => {
    const holder = Keypair.random();
    mockLoadAccount.mockResolvedValueOnce(new Account(holder.publicKey(), '1'));
    mockSubmitTransaction.mockRejectedValueOnce({ response: { status: 400 } });

    await expect(
      burnAsset({
        holderSecret: holder.secret(),
        assetCode: 'ECO',
        assetIssuer: Keypair.random().publicKey(),
        amount: '10',
      })
    ).rejects.toEqual({ response: { status: 400 } });
  });
});

describe('getTotalSupply', () => {
  const mockGetServer = StellarService.getServer as jest.Mock;

  beforeEach(() => {
    mockGetServer.mockReset();
  });

  it('returns the amount reported by the Horizon asset stats endpoint', async () => {
    const forIssuer = jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: [{ amount: '5000.0000000' }] }),
      }),
    });
    const forCode = jest.fn().mockReturnValue({ forIssuer });
    mockGetServer.mockReturnValue({ assets: () => ({ forCode }) });

    const supply = await getTotalSupply('ECO', 'GISSUER');

    expect(supply).toBe('5000.0000000');
    expect(forCode).toHaveBeenCalledWith('ECO');
    expect(forIssuer).toHaveBeenCalledWith('GISSUER');
  });

  it('returns zero supply when Horizon has no record for the asset', async () => {
    const forIssuer = jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: [] }),
      }),
    });
    const forCode = jest.fn().mockReturnValue({ forIssuer });
    mockGetServer.mockReturnValue({ assets: () => ({ forCode }) });

    const supply = await getTotalSupply('ECO', 'GISSUER');

    expect(supply).toBe('0.0000000');
  });
});
