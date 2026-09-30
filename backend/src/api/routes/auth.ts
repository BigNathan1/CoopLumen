import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { validateBody, validateParams } from '../middleware/validate';
import { authChallengeParamsSchema, authChallengeSchema, authVerifySchema } from '../schemas/auth';
import { createSessionToken } from '../utils/sessionToken';
import { clearAuthCookie, setAuthCookie } from '../utils/authCookie';
import {
  issueRefreshToken,
  consumeRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from '../utils/refreshToken';

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

function issueChallenge(address: string): string {
  pruneExpiredChallenges();

  const nonce = randomBytes(24).toString('hex');
  const challenge = `CoopLumen authentication request\naddress: ${address}\nnonce: ${nonce}`;

  pendingChallenges.set(address, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return challenge;
}

/**
 * @route GET /api/v1/auth/challenge/:publicKey
 * @access Public
 * @description First step of wallet sign-in: issues a one-time message for the
 * caller to sign with the Freighter wallet that controls `publicKey`, proving
 * they hold its private key without ever transmitting it.
 * @param {string} params.publicKey - Stellar StrKey the caller claims to control.
 * @returns {200} `{ data: { challenge } }`
 */
authRouter.get(
  '/challenge/:publicKey',
  validateParams(authChallengeParamsSchema),
  (req: Request, res: Response): void => {
    const { publicKey } = req.params as { publicKey: string };
    res.json({ data: { challenge: issueChallenge(publicKey) } });
  }
);

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
    const { address } = req.body as { address: string };
    res.json({ data: { challenge: issueChallenge(address) } });
  }
);

/**
 * @route POST /api/v1/auth/verify
 * @access Public
 * @description Second step of wallet sign-in: verifies the Ed25519 signature
 * over a challenge previously issued for `address` and, on success, mints a
 * short-lived HMAC-signed session token to authenticate later requests as
 * that address. The token is set in an httpOnly, SameSite=Strict cookie (Secure
 * in production) so browser scripts cannot read it, and is also returned in the
 * body for non-browser clients that send it as a Bearer token.
 * @param {string} body.address - Stellar StrKey that signed the challenge.
 * @param {string} body.challenge - The exact challenge string returned by /challenge.
 * @param {string} body.signature - Base64-encoded Ed25519 signature over the challenge.
 * @returns {200} `{ data: { token, address, expiresAt } }` plus a `Set-Cookie` session cookie.
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
  setAuthCookie(res, token, expiresAt);
  const refresh = issueRefreshToken(address);
  setRefreshCookie(res, refresh.token, refresh.expiresAt);
  res.json({ data: { token, address, expiresAt } });
});

/**
 * @route POST /api/v1/auth/refresh
 * @access Public (requires the httpOnly refresh cookie set by /verify or a previous refresh)
 * @description Exchanges a refresh token for a new session token without a new
 * wallet signature. Refresh tokens rotate: the presented one is invalidated and
 * a replacement is set, so a stolen token that was already used is useless.
 * The new session token is set in the session cookie and returned in the body.
 * @returns {200} `{ data: { token, address, expiresAt } }` plus `Set-Cookie` for the session and refresh cookies.
 * @returns {401} Refresh token missing, unknown, already used, or expired.
 */
authRouter.post('/refresh', (req: Request, res: Response): void => {
  const presented = readRefreshCookie(req);
  const address = presented ? consumeRefreshToken(presented) : null;

  if (!address) {
    clearRefreshCookie(res);
    res.status(401).json({ data: null, error: 'Invalid or expired refresh token' });
    return;
  }

  const { token, expiresAt } = createSessionToken(address);
  const next = issueRefreshToken(address);
  setAuthCookie(res, token, expiresAt);
  setRefreshCookie(res, next.token, next.expiresAt);
  res.json({ data: { token, address, expiresAt } });
});

/**
 * @route POST /api/v1/auth/logout
 * @access Public
 * @description Ends the browser session by expiring the httpOnly session
 * cookie. Idempotent: it succeeds whether or not a cookie was sent, so a client
 * with an already-expired session can still log out cleanly. Session tokens are
 * stateless HMAC tokens, so a copy of the token held elsewhere stays valid until
 * its own expiry (1 hour); this endpoint only removes it from the browser.
 * @returns {200} `{ data: { loggedOut: true } }` plus a `Set-Cookie` that expires the cookie.
 */
authRouter.post('/logout', (_req: Request, res: Response): void => {
  clearAuthCookie(res);
  res.json({ data: { loggedOut: true } });
});
