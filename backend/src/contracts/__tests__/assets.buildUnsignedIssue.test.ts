import { Account, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { buildUnsignedIssueAsset } from '../assets';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
  },
}));

const mockLoadAccount = StellarService.loadAccount as jest.Mock;

const issuerKeypair = Keypair.random();
const distributorKeypair = Keypair.random();

beforeEach(() => {
  mockLoadAccount.mockReset();
  mockLoadAccount.mockImplementation((publicKey: string) =>
    Promise.resolve(new Account(publicKey, '1'))
  );
});

describe('buildUnsignedIssueAsset', () => {
  it('builds an unsigned XDR payment from the issuer to the distributor', async () => {
    const xdr = await buildUnsignedIssueAsset({
      issuerPublicKey: issuerKeypair.publicKey(),
      assetCode: 'ECO',
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '1000',
    });

    expect(typeof xdr).toBe('string');
    expect(xdr.length).toBeGreaterThan(0);
    expect(mockLoadAccount).toHaveBeenCalledWith(issuerKeypair.publicKey());

    const tx = new Transaction(xdr, Networks.TESTNET);
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0]).toMatchObject({
      type: 'payment',
      destination: distributorKeypair.publicKey(),
      amount: '1000.0000000',
    });
    expect((tx.operations[0] as { asset: { getCode(): string } }).asset.getCode()).toBe('ECO');
    expect(
      (tx.operations[0] as { asset: { getIssuer(): string } }).asset.getIssuer()
    ).toBe(issuerKeypair.publicKey());
  });

  it('leaves the envelope unsigned', async () => {
    const xdr = await buildUnsignedIssueAsset({
      issuerPublicKey: issuerKeypair.publicKey(),
      assetCode: 'ECO',
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '1000',
    });

    const tx = new Transaction(xdr, Networks.TESTNET);
    expect(tx.signatures).toHaveLength(0);
  });

  it('attaches a text memo when one is supplied', async () => {
    const xdr = await buildUnsignedIssueAsset({
      issuerPublicKey: issuerKeypair.publicKey(),
      assetCode: 'ECO',
      distributorPublicKey: distributorKeypair.publicKey(),
      amount: '1000',
      memo: 'seed round',
    });

    const tx = new Transaction(xdr, Networks.TESTNET);
    expect(tx.memo.type).toBe('text');
    expect(tx.memo.value?.toString()).toBe('seed round');
  });
});
