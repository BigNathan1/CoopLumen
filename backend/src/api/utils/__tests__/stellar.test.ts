import { Keypair } from '@stellar/stellar-sdk';
import { isValidStellarPublicKey } from '../stellar';

describe('isValidStellarPublicKey', () => {
  it('accepts a real 56-character Stellar public key', () => {
    const key = Keypair.random().publicKey();
    expect(key).toHaveLength(56);
    expect(isValidStellarPublicKey(key)).toBe(true);
  });

  it('rejects a key that is too short', () => {
    const key = Keypair.random().publicKey().slice(0, 55);
    expect(isValidStellarPublicKey(key)).toBe(false);
  });

  it('rejects a key that is too long', () => {
    const key = Keypair.random().publicKey() + 'A';
    expect(isValidStellarPublicKey(key)).toBe(false);
  });

  it('rejects a key with an invalid checksum', () => {
    const key = Keypair.random().publicKey();
    const tampered = key.slice(0, -1) + (key.at(-1) === 'A' ? 'B' : 'A');
    expect(isValidStellarPublicKey(tampered)).toBe(false);
  });

  it('rejects a secret key (starts with S, not G)', () => {
    const secret = Keypair.random().secret();
    expect(isValidStellarPublicKey(secret)).toBe(false);
  });

  it('rejects non-StrKey garbage', () => {
    expect(isValidStellarPublicKey('not-a-stellar-key')).toBe(false);
    expect(isValidStellarPublicKey('')).toBe(false);
  });
});
