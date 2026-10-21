import { createHmac } from 'node:crypto';

/**
 * The Stellar address the suite acts as.
 *
 * The backend only accepts a community whose issuer is the authenticated
 * address, so the suite signs in as one address and issues its community
 * from that same address.
 */
export const E2E_MEMBER_ADDRESS = 'GDMZRAGTOJHQK3LN3D2EDLEAMS76EDIQEMWCUTYIYHUE5HFPLPGBCGUS';

/**
 * Secret the backend signs session tokens with.
 *
 * The E2E Compose stack sets the same value on the backend, so a token
 * minted here is a token the backend verifies. It is a throwaway secret for
 * a throwaway stack; it is never a production credential.
 */
export const SESSION_SECRET = process.env.AUTH_SESSION_SECRET ?? 'governance-e2e-secret';

/**
 * Mints a session token the backend accepts.
 *
 * The wallet flow signs a challenge and receives this token from
 * `POST /api/v1/auth/verify`. A browser extension cannot sign in a CI run, so
 * the suite mints the same token with the same HMAC the backend uses and
 * presents it as a bearer token.
 */
export function createSessionToken(address: string, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { address, iat: now, exp: now + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}
