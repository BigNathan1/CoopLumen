import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

jest.mock('../stellar', () => ({
  StellarService: {
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  },
}));

import { StellarError } from '../errors';
import {
  DISTRIBUTOR_PUBLIC_KEY_ENV,
  getDistributorPublicKey,
  signTransactionWithSecret,
} from '../signing';

const distributor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11));
const member = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 12));
const destination = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 13)).publicKey();

/** Builds an unsigned envelope from the given account, on the given network. */
function unsignedEnvelope(source: Keypair, networkPassphrase = Networks.TESTNET): string {
  return new TransactionBuilder(new Account(source.publicKey(), '7'), {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: '1' }))
    .setTimeout(30)
    .build()
    .toXDR();
}

function parse(xdr: string): Transaction {
  return TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
}

beforeEach(() => {
  process.env[DISTRIBUTOR_PUBLIC_KEY_ENV] = distributor.publicKey();
});

afterEach(() => {
  delete process.env[DISTRIBUTOR_PUBLIC_KEY_ENV];
});

describe('getDistributorPublicKey', () => {
  it('reads the configured distributor account', () => {
    expect(getDistributorPublicKey()).toBe(distributor.publicKey());
  });

  it('treats a blank value as unconfigured', () => {
    process.env[DISTRIBUTOR_PUBLIC_KEY_ENV] = '   ';
    expect(getDistributorPublicKey()).toBeUndefined();
  });
});

describe('signTransactionWithSecret', () => {
  it('adds a valid distributor signature to the envelope', () => {
    const xdr = unsignedEnvelope(distributor);

    const signed = parse(signTransactionWithSecret(xdr, distributor.secret()));

    expect(signed.signatures).toHaveLength(1);
    expect(distributor.verify(signed.hash(), signed.signatures[0].signature())).toBe(true);
  });

  it('leaves the transaction itself untouched', () => {
    const xdr = unsignedEnvelope(distributor);

    const signed = parse(signTransactionWithSecret(xdr, distributor.secret()));
    const original = parse(xdr);

    expect(signed.source).toBe(original.source);
    expect(signed.sequence).toBe(original.sequence);
    expect(signed.operations).toEqual(original.operations);
  });

  it('is a no-op when the key has already signed', () => {
    const transaction = parse(unsignedEnvelope(distributor));
    transaction.sign(distributor);

    const signed = parse(signTransactionWithSecret(transaction.toXDR(), distributor.secret()));

    expect(signed.signatures).toHaveLength(1);
  });

  it('co-signs an envelope another key has already signed', () => {
    const transaction = parse(unsignedEnvelope(member));
    transaction.sign(member);

    const signed = parse(signTransactionWithSecret(transaction.toXDR(), distributor.secret()));

    expect(signed.signatures).toHaveLength(2);
  });

  it('refuses to sign for any account but the distributor', () => {
    const xdr = unsignedEnvelope(member);

    expect(() => signTransactionWithSecret(xdr, member.secret())).toThrow(
      `Transaction signing failed: ${member.publicKey()} is not the configured distributor account; only the distributor may be signed for on the server`
    );
  });

  it('answers a refused signer with a 403', () => {
    try {
      signTransactionWithSecret(unsignedEnvelope(member), member.secret());
      throw new Error('expected the signing attempt to be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(StellarError);
      expect((error as StellarError).status).toBe(403);
    }
  });

  it('fails closed when no distributor is configured', () => {
    delete process.env[DISTRIBUTOR_PUBLIC_KEY_ENV];

    expect(() =>
      signTransactionWithSecret(unsignedEnvelope(distributor), distributor.secret())
    ).toThrow(/no server-side signer is configured/);
  });

  it('honours an explicit signer allow-list', () => {
    delete process.env[DISTRIBUTOR_PUBLIC_KEY_ENV];

    const signed = parse(
      signTransactionWithSecret(unsignedEnvelope(member), member.secret(), {
        allowedSigners: [member.publicKey()],
      })
    );

    expect(signed.signatures).toHaveLength(1);
  });

  it('rejects a signer missing from an explicit allow-list', () => {
    expect(() =>
      signTransactionWithSecret(unsignedEnvelope(distributor), distributor.secret(), {
        allowedSigners: [member.publicKey()],
      })
    ).toThrow(/is not the configured distributor account/);
  });

  it('rejects an invalid secret without naming it', () => {
    const secret = 'SNOTAREALSECRETKEYVALUE';

    try {
      signTransactionWithSecret(unsignedEnvelope(distributor), secret);
      throw new Error('expected the signing attempt to be refused');
    } catch (error) {
      expect((error as Error).message).toBe(
        'Transaction signing failed: the secret is not a valid Stellar secret key'
      );
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('never puts the secret in the error of a refused signer', () => {
    try {
      signTransactionWithSecret(unsignedEnvelope(member), member.secret());
      throw new Error('expected the signing attempt to be refused');
    } catch (error) {
      expect((error as Error).message).not.toContain(member.secret());
    }
  });

  it('rejects an empty envelope', () => {
    expect(() => signTransactionWithSecret('   ', distributor.secret())).toThrow(
      'Transaction signing failed: no transaction envelope was provided'
    );
  });

  it('rejects a malformed envelope', () => {
    expect(() => signTransactionWithSecret('not-xdr', distributor.secret())).toThrow(
      'Transaction signing failed: the XDR is not a valid transaction envelope for the configured network'
    );
  });

  it('signs against the configured network, so the signature is worthless elsewhere', () => {
    // An envelope carries no network marker; the signature is what binds it to
    // one. Signing here must therefore not produce a mainnet-valid signature.
    const signed = parse(
      signTransactionWithSecret(unsignedEnvelope(distributor), distributor.secret())
    );
    const onMainnet = TransactionBuilder.fromXDR(signed.toXDR(), Networks.PUBLIC) as Transaction;

    expect(distributor.verify(signed.hash(), signed.signatures[0].signature())).toBe(true);
    expect(distributor.verify(onMainnet.hash(), onMainnet.signatures[0].signature())).toBe(false);
  });
});
