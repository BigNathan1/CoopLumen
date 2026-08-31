import { FeeBumpTransaction, Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { StellarError } from './errors';

/**
 * Server-side signing for the one account the backend is allowed to hold a key
 * for: the community distributor. Member funds are signed in the member's
 * wallet (`buildUnsignedPayment` -> Freighter -> `submitSignedXdr`); this helper
 * exists only for treasury flows such as disbursals and airdrops.
 *
 * The allow-list is enforced here rather than at each call site, so a leaked or
 * mistakenly passed member secret cannot be used to sign anything, and it fails
 * closed: with no distributor configured, nothing is signed.
 */

/** Env var naming the single account the server may sign for. */
export const DISTRIBUTOR_PUBLIC_KEY_ENV = 'STELLAR_DISTRIBUTOR_PUBLIC_KEY';

export interface SignTransactionOptions {
  /**
   * Public keys allowed to sign, overriding the configured distributor. Intended
   * for callers that already know which treasury account they are acting as.
   */
  allowedSigners?: string[];
}

/** The distributor account the server is configured to sign for, if any. */
export function getDistributorPublicKey(): string | undefined {
  const configured = process.env[DISTRIBUTOR_PUBLIC_KEY_ENV]?.trim();
  return configured ? configured : undefined;
}

function reject(detail: string, status = 400): never {
  throw new StellarError(`Transaction signing failed: ${detail}`, { status });
}

/**
 * Resolves the signing keypair without ever putting the secret in a message.
 * Errors name the public key at most, never the secret.
 */
function toKeypair(secret: string): Keypair {
  try {
    return Keypair.fromSecret(secret);
  } catch {
    return reject('the secret is not a valid Stellar secret key');
  }
}

function assertAllowed(signerPublicKey: string, allowedSigners?: string[]): void {
  const distributor = getDistributorPublicKey();
  const allowed = allowedSigners ?? (distributor ? [distributor] : []);

  if (allowed.length === 0) {
    reject(
      `no server-side signer is configured; set ${DISTRIBUTOR_PUBLIC_KEY_ENV} to the distributor account before signing on the server`,
      500
    );
  }

  if (!allowed.includes(signerPublicKey)) {
    reject(
      `${signerPublicKey} is not the configured distributor account; only the distributor may be signed for on the server`,
      403
    );
  }
}

/** True when this keypair has already signed the envelope. */
function hasSignature(transaction: Transaction | FeeBumpTransaction, keypair: Keypair): boolean {
  const payload = transaction.hash();
  return transaction.signatures.some((signature) => {
    try {
      return keypair.verify(payload, signature.signature());
    } catch {
      return false;
    }
  });
}

/**
 * Signs a transaction envelope with a server-held secret and returns the signed
 * base64 XDR, ready for `submitSignedXdr`.
 *
 * Signing is restricted to the distributor account named by
 * `STELLAR_DISTRIBUTOR_PUBLIC_KEY` (or to `options.allowedSigners`, when the
 * caller knows the treasury account it is acting as). Anything else is refused
 * with a `403`, and a missing configuration is refused with a `500` rather than
 * silently signing with whatever secret it was handed.
 *
 * A transaction envelope carries no network marker, so the signature is what
 * binds it to a network: signing happens against the configured passphrase, and
 * the result is therefore worthless on any other network. Signing an envelope
 * this key already signed is a no-op, because adding the same signature twice
 * would have Horizon reject the submission with `tx_bad_auth_extra`.
 *
 * @param xdr    Base64 transaction envelope to sign.
 * @param secret Secret key of the distributor account.
 */
export function signTransactionWithSecret(
  xdr: string,
  secret: string,
  options: SignTransactionOptions = {}
): string {
  if (!xdr.trim()) {
    reject('no transaction envelope was provided');
  }

  const keypair = toKeypair(secret);
  assertAllowed(keypair.publicKey(), options.allowedSigners);

  let transaction: Transaction | FeeBumpTransaction;
  try {
    transaction = TransactionBuilder.fromXDR(xdr, StellarService.getNetwork());
  } catch {
    return reject('the XDR is not a valid transaction envelope for the configured network');
  }

  if (hasSignature(transaction, keypair)) {
    return transaction.toXDR();
  }

  transaction.sign(keypair);
  return transaction.toXDR();
}
