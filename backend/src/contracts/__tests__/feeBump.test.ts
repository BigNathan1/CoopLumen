import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { buildFeeBumpTransaction, submitFeeBumpTransaction } from '../feeBump';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getNetworkPassphrase: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    submitTransaction: jest.fn(),
  },
}));

function buildSignedInnerTransaction(): { xdr: string; source: Keypair } {
  const source = Keypair.random();
  const account = new Account(source.publicKey(), '1');

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: '1',
      })
    )
    .setTimeout(30)
    .build();

  tx.sign(source);
  return { xdr: tx.toXDR(), source };
}

describe('buildFeeBumpTransaction', () => {
  it('wraps the inner transaction with the sponsor as the fee source', () => {
    const { xdr } = buildSignedInnerTransaction();
    const sponsor = Keypair.random();

    const feeBumpTx = buildFeeBumpTransaction({
      innerTransactionXdr: xdr,
      sponsorSecret: sponsor.secret(),
    });

    expect(feeBumpTx.feeSource).toBe(sponsor.publicKey());
    expect(feeBumpTx.innerTransaction.toXDR()).toBe(xdr);
    expect(feeBumpTx.signatures).toHaveLength(1);
  });

  it('defaults to BASE_FEE per operation when no baseFee is supplied', () => {
    const { xdr } = buildSignedInnerTransaction();
    const sponsor = Keypair.random();

    const feeBumpTx = buildFeeBumpTransaction({
      innerTransactionXdr: xdr,
      sponsorSecret: sponsor.secret(),
    });

    // The fee-bump transaction's total fee covers its own outer operation plus
    // every operation in the inner transaction (one payment here), each at BASE_FEE.
    expect(feeBumpTx.fee).toBe(String(Number(BASE_FEE) * 2));
  });
});

describe('submitFeeBumpTransaction', () => {
  const mockSubmitTransaction = StellarService.submitTransaction as jest.Mock;

  beforeEach(() => {
    mockSubmitTransaction.mockReset();
  });

  it('submits the signed fee-bump transaction and returns the tx hash', async () => {
    const { xdr } = buildSignedInnerTransaction();
    const sponsor = Keypair.random();
    mockSubmitTransaction.mockResolvedValueOnce({ hash: 'fee-bump-hash' });

    const hash = await submitFeeBumpTransaction({
      innerTransactionXdr: xdr,
      sponsorSecret: sponsor.secret(),
    });

    expect(hash).toBe('fee-bump-hash');
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
  });
});
