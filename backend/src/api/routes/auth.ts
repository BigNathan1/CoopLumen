import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { validateBody } from '../middleware/validate';
import { authChallengeSchema, authVerifySchema } from '../schemas/auth';
import { createSessionToken } from '../utils/sessionToken';

export const authRouter: Router = Router();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface PendingChallenge {
  challenge: string;
  expiresAt: number;
}

/**
 * Outstanding sign-in challenges, keyed by address. In-memory is sufficient
 * because a challenge is single-use and short-lived (5 minutes) — losing them
 * on a restart just means the client re-requests one, and a multi-instance
 * deployment would need this in Redis alongside the balance cache.
 */
const pendingChallenges = new Map<string, PendingChallenge>();

function pruneExpiredChallenges(): void {
  const now = Date.now();
  for (const [address, entry] of pendingChallenges) {
    if (entry.expiresAt < now) {
      pendingChallenges.delete(address);
    }
  }
}

/**
 * @route POST /api/v1/auth/challenge
 * @access Public
 * @description First step of wallet sign-in: issues a one-time message for the
 * caller to sign with the Freighter wallet that controls `address`, proving
 * they hold its private key without ever transmitting it.
 * @param {string} body.address - Stellar StrKey the caller claims to control.
 * @returns {200} `{ data: { challenge } }`
 */
authRouter.post(
  '/challenge',
  validateBody(authChallengeSchema),
  (req: Request, res: Response): void => {
    pruneExpiredChallenges();

    const { address } = req.body as { address: string };
    const nonce = randomBytes(24).toString('hex');
    const challenge = `CoopLumen authentication request\naddress: ${address}\nnonce: ${nonce}`;

    pendingChallenges.set(address, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });

    res.json({ data: { challenge } });
  }
);

/**
 * @route POST /api/v1/auth/verify
 * @access Public
 * @description Second step of wallet sign-in: verifies the Ed25519 signature
 * over a challenge previously issued for `address` and, on success, mints a
 * short-lived HMAC-signed session token to authenticate later requests as
 * that address.
 * @param {string} body.address - Stellar StrKey that signed the challenge.
 * @param {string} body.challenge - The exact challenge string returned by /challenge.
 * @param {string} body.signature - Base64-encoded Ed25519 signature over the challenge.
 * @returns {200} `{ data: { token, address, expiresAt } }`
 * @returns {401} Challenge missing/expired/mismatched, or signature verification failed.
 */
authRouter.post('/verify', validateBody(authVerifySchema), (req: Request, res: Response): void => {
  pruneExpiredChallenges();

  const { address, challenge, signature } = req.body as {
    address: string;
    challenge: string;
    signature: string;
  };

  const pending = pendingChallenges.get(address);
  if (!pending || pending.challenge !== challenge) {
    res.status(401).json({
      data: null,
      error: 'No matching challenge for this address. Request a new one.',
    });
    return;
  }

  // Single-use: consumed whether or not the signature checks out, so a
  // captured signature cannot be replayed against the same challenge.
  pendingChallenges.delete(address);

  let verified = false;
  try {
    verified = Keypair.fromPublicKey(address).verify(
      Buffer.from(challenge, 'utf8'),
      Buffer.from(signature, 'base64')
    );
  } catch {
    verified = false;
  }

  if (!verified) {
    res.status(401).json({ data: null, error: 'Signature verification failed' });
    return;
  }

  const { token, expiresAt } = createSessionToken(address);
  res.json({ data: { token, address, expiresAt } });
});
