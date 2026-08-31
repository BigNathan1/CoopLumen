import { Keypair } from '@stellar/stellar-sdk';
import {
  assertAssetCode,
  assertMemoLength,
  assertNonNegativeAmount,
  assertPositiveAmount,
  assertPublicKey,
  parseSecretKey,
} from '../validation';

const keypair = Keypair.random();

describe('parseSecretKey', () => {
  it('returns the keypair for a well-formed secret', () => {
    expect(parseSecretKey('op', 'accountSecret', keypair.secret()).publicKey()).toBe(
      keypair.publicKey()
    );
  });

  it('names the offending field on a malformed secret', () => {
    expect(() => parseSecretKey('op', 'accountSecret', 'nope')).toThrow(
      'accountSecret is not a valid Stellar secret key.'
    );
    expect(() => parseSecretKey('op', 'accountSecret', 'nope')).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT', httpStatus: 400 }) as unknown as Error
      'op failed: accountSecret is not a valid Stellar secret key.'
    );
    expect(() => parseSecretKey('op', 'accountSecret', 'nope')).toThrow(
      expect.objectContaining({ name: 'StellarError', status: 400 }) as unknown as Error
    );
  });

  it('rejects a public key passed where a secret belongs', () => {
    expect(() => parseSecretKey('op', 'accountSecret', keypair.publicKey())).toThrow(
      'accountSecret is not a valid Stellar secret key.'
    );
  });
});

describe('assertPublicKey', () => {
  it('accepts a valid ed25519 public key', () => {
    expect(() => assertPublicKey('op', 'assetIssuer', keypair.publicKey())).not.toThrow();
  });

  it.each([['GNOPE'], [''], [keypair.secret()]])('rejects %s', (value) => {
    expect(() => assertPublicKey('op', 'assetIssuer', value)).toThrow(
      'assetIssuer is not a valid Stellar public key.'
    );
  });
});

describe('assertAssetCode', () => {
  it.each([['ECO'], ['A'], ['ABCDEFGHIJKL'], ['Eco2']])('accepts %s', (value) => {
    expect(() => assertAssetCode('op', 'assetCode', value)).not.toThrow();
  });

  it.each([[''], ['ECO-1'], ['ABCDEFGHIJKLM'], ['EC O']])('rejects %s', (value) => {
    expect(() => assertAssetCode('op', 'assetCode', value)).toThrow(
      /assetCode must be 1-12 alphanumeric characters/
    );
  });
});

describe('assertPositiveAmount', () => {
  it.each([['1'], ['0.0000001'], ['1000.5']])('accepts %s', (value) => {
    expect(() => assertPositiveAmount('op', 'amount', value)).not.toThrow();
  });

  it.each([['0'], ['0.00000001'], ['-1'], ['1e3'], [''], ['10 ECO']])('rejects %s', (value) => {
    expect(() => assertPositiveAmount('op', 'amount', value)).toThrow(
      /amount must be a positive decimal string/
    );
  });
});

describe('assertNonNegativeAmount', () => {
  it('accepts zero, which a trustline limit may legitimately be', () => {
    expect(() => assertNonNegativeAmount('op', 'limit', '0')).not.toThrow();
  });

  it.each([['-1'], ['0.00000001'], ['abc']])('rejects %s', (value) => {
    expect(() => assertNonNegativeAmount('op', 'limit', value)).toThrow(
      /limit must be a non-negative decimal string/
    );
  });
});

describe('assertMemoLength', () => {
  it('accepts an absent memo and a 28-byte memo', () => {
    expect(() => assertMemoLength('op', undefined)).not.toThrow();
    expect(() => assertMemoLength('op', 'x'.repeat(28))).not.toThrow();
  });

  it('measures bytes rather than characters', () => {
    expect(() => assertMemoLength('op', 'é'.repeat(14))).not.toThrow();
    expect(() => assertMemoLength('op', 'é'.repeat(15))).toThrow(/28 bytes or fewer/);
  });
});
