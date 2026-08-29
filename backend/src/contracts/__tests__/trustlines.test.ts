import {
  Account,
  Asset,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { buildUnsignedTrustline, hasTrustline } from '../trustlines';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    getAccountBalance: jest.fn(),
    loadAccount: jest.fn(),
  },
}));

describe('hasTrustline', () => {
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;

  beforeEach(() => {
    mockLoadAccount.mockReset();
  });

  it('returns true when trustline exists', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'ECO',
          asset_issuer: 'GISSUER',
          balance: '100.0000000',
        },
      ],
    });

    const result = await hasTrustline('GPUBKEY', 'ECO', 'GISSUER');
    expect(result).toBe(true);
  });

  it('returns false when no trustline exists', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '10.0000000' }],
    });

    const result = await hasTrustline('GPUBKEY', 'ECO', 'GISSUER');
    expect(result).toBe(false);
  });
});

describe('buildUnsignedTrustline', () => {
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;
  const accountPublicKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
  const assetIssuer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

  beforeEach(() => {
    mockLoadAccount.mockReset();
    (StellarService.getNetwork as jest.Mock).mockReturnValue(Networks.TESTNET);
  });

  it('builds an unsigned changeTrust transaction with the loaded sequence number', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(accountPublicKey, '50'));

    const xdr = await buildUnsignedTrustline({
      accountPublicKey,
      assetCode: 'COOP',
      assetIssuer,
    });

    expect(mockLoadAccount).toHaveBeenCalledWith(accountPublicKey);

    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    expect(transaction.sequence).toBe('51');
    expect(transaction.signatures).toHaveLength(0);
    expect(transaction.operations).toHaveLength(1);

    const operation = transaction.operations[0];
    expect(operation.type).toBe('changeTrust');
    if (operation.type === 'changeTrust' && operation.line instanceof Asset) {
      expect(operation.line.getCode()).toBe('COOP');
      expect(operation.line.getIssuer()).toBe(assetIssuer);
      expect(operation.limit).toBe('922337203685.4775807');
    }
  });

  it('builds an unsigned changeTrust transaction with a custom limit', async () => {
    mockLoadAccount.mockResolvedValueOnce(new Account(accountPublicKey, '10'));

    const xdr = await buildUnsignedTrustline({
      accountPublicKey,
      assetCode: 'COOP',
      assetIssuer,
      limit: '5000.5',
    });

    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    const operation = transaction.operations[0];
    expect(operation.type).toBe('changeTrust');
    if (operation.type === 'changeTrust') {
      expect(operation.limit).toBe('5000.5000000');
    }
  });
});
