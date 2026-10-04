import { Request, Response } from 'express';

/** Name of the httpOnly cookie that carries the session token. */
export const AUTH_COOKIE_NAME = 'cooplumen_session';

/**
 * Cookie attributes shared by set and clear. Browsers only remove a cookie
 * when the clearing Set-Cookie matches the attributes it was set with.
 */
function baseOptions(): { httpOnly: true; secure: boolean; sameSite: 'strict'; path: string } {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

/** Sets the session token as an httpOnly cookie that expires with the token. */
export function setAuthCookie(res: Response, token: string, expiresAt: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, { ...baseOptions(), expires: new Date(expiresAt) });
}

/** Expires the session cookie in the client. */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, baseOptions());
}

/**
 * Reads the session token from the request's `Cookie` header. The app does not
 * use cookie-parser, so the header is parsed here; returns null when absent.
 */
export function readAuthCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== AUTH_COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }
  return null;
}
