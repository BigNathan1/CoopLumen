import { Account, Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
    createAccount: jest.fn(async (params) => {
      return 'mock-tx-hash';
    }),
  },
}));

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

describe('createAccount', () => {
  it('creates an account successfully using createAccount operation', async () => {
    const funder = Keypair.random();
    const destination = Keypair.random().publicKey();

    const hash = await StellarService.createAccount({
      funderSecret: funder.secret(),
      destinationPublicKey: destination,
      startingBalance: '10.0000000',
    });

    expect(hash).toBe('mock-tx-hash');
  });
});
