import { Account, Keypair, Transaction } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

describe('StellarService.createAccount', () => {
  const mockLoadAccount = jest.spyOn(StellarService, 'loadAccount');
  const mockSubmitTransaction = jest.spyOn(StellarService, 'submitTransaction');

  beforeEach(() => {
    mockLoadAccount.mockReset();
    mockSubmitTransaction.mockReset();
  });

  afterAll(() => {
    mockLoadAccount.mockRestore();
    mockSubmitTransaction.mockRestore();
  });

  it('creates an account successfully using the CreateAccount operation', async () => {
    const funder = Keypair.random();
    const destination = Keypair.random().publicKey();

    mockLoadAccount.mockResolvedValueOnce(new Account(funder.publicKey(), '1') as never);
    mockSubmitTransaction.mockResolvedValueOnce({ hash: 'create-account-hash' } as never);

    const hash = await StellarService.createAccount({
      funderSecret: funder.secret(),
      destinationPublicKey: destination,
      startingBalance: '10.0000000',
    });

    expect(hash).toBe('create-account-hash');
    expect(mockLoadAccount).toHaveBeenCalledWith(funder.publicKey());

    const [submittedTx] = mockSubmitTransaction.mock.calls[0] as [Transaction];
    expect(submittedTx.operations).toHaveLength(1);
    expect(submittedTx.operations[0].type).toBe('createAccount');
    expect((submittedTx.operations[0] as any).destination).toBe(destination);
    expect((submittedTx.operations[0] as any).startingBalance).toBe('10.0000000');
  });

  it('propagates Horizon submission errors', async () => {
    const funder = Keypair.random();
    const destination = Keypair.random().publicKey();

    mockLoadAccount.mockResolvedValueOnce(new Account(funder.publicKey(), '1') as never);
    const horizonError = {
      response: { status: 400, data: { extras: { result_codes: { operations: ['op_already_exists'] } } } },
    };
    mockSubmitTransaction.mockRejectedValueOnce(horizonError as never);

    await expect(
      StellarService.createAccount({
        funderSecret: funder.secret(),
        destinationPublicKey: destination,
        startingBalance: '10.0000000',
      })
    ).rejects.toEqual(horizonError);
  });
});
