import { StrKey } from '@stellar/stellar-sdk';

/** True when the value is a structurally valid Stellar ed25519 public key (G...). */
export function isValidStellarPublicKey(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value);
}
