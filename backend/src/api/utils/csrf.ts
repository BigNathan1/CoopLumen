import crypto from 'crypto';
import { Request, Response } from 'express';

/** Name of the cookie that carries the CSRF token. */
export const CSRF_COOKIE_NAME = 'cooplumen_csrf';

/** Name of the header where client must submit the CSRF token. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generates a cryptographically strong 32-byte (64-hex-char) CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Cookie options for the CSRF cookie. */
function csrfCookieOptions(): {
  httpOnly: false;
  secure: boolean;
  sameSite: 'strict';
  path: string;
} {
  return {
    httpOnly: false, // Must be readable by client JavaScript to copy into request header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

/** Sets the CSRF token cookie. */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
}

/** Clears the CSRF token cookie. */
export function clearCsrfCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions());
}

/** Reads the CSRF token from the Cookie header. */
export function readCsrfCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== CSRF_COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Reads the CSRF token from custom headers (`x-csrf-token` or `x-xsrf-token`). */
export function readCsrfHeader(req: Request): string | null {
  const header = req.headers[CSRF_HEADER_NAME] ?? req.headers['x-xsrf-token'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  return null;
}

/**
 * Validates the double-submit CSRF token using constant-time comparison.
 */
export function validateCsrfToken(cookieToken: string | null, headerToken: string | null): boolean {
  if (!cookieToken || !headerToken) {
    return false;
  }

  // Token must be 64-hex string
  if (cookieToken.length !== 64 || headerToken.length !== 64) {
    return false;
  }

  try {
    const cookieBuf = Buffer.from(cookieToken, 'hex');
    const headerBuf = Buffer.from(headerToken, 'hex');
    if (cookieBuf.length !== 32 || headerBuf.length !== 32) {
      return false;
    }
    return crypto.timingSafeEqual(cookieBuf, headerBuf);
  } catch {
    return false;
  }
}
