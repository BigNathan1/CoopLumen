import { Request, Response, NextFunction } from 'express';
import { readAuthCookie } from '../utils/authCookie';
import { readCsrfCookie, readCsrfHeader, validateCsrfToken } from '../utils/csrf';
import { logger } from '../../utils/logger';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF protection middleware (#359 / #281).
 *
 * For state-changing HTTP requests (POST, PUT, DELETE, PATCH):
 * - If the request is authenticated via session cookie (`cooplumen_session`),
 *   it must present a matching CSRF token in the `x-csrf-token` header matching
 *   the `cooplumen_csrf` cookie.
 * - Non-browser programmatic requests using only `Authorization: Bearer <token>`
 *   without session cookies are safe from cross-origin browser form submission
 *   and pass through.
 * - Missing or mismatched CSRF tokens are rejected with HTTP 403 in the standard
 *   `{ data: null, error: '...' }` envelope.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Exempt auth endpoints that establish, refresh, or clear sessions
  if (
    req.path === '/auth/verify' ||
    req.path === '/auth/refresh' ||
    req.path === '/auth/logout' ||
    req.path.startsWith('/auth/challenge')
  ) {
    next();
    return;
  }

  const hasSessionCookie = Boolean(readAuthCookie(req));
  const csrfCookie = readCsrfCookie(req);

  // If the request uses cookie auth or carries a CSRF cookie, validate the double-submit token
  if (hasSessionCookie || csrfCookie) {
    const csrfHeader = readCsrfHeader(req);
    const isValid = validateCsrfToken(csrfCookie, csrfHeader);

    if (!isValid) {
      logger.warn('CSRF token validation failed', {
        path: req.path,
        method: req.method,
        hasCookie: Boolean(csrfCookie),
        hasHeader: Boolean(csrfHeader),
      });

      res.status(403).json({
        data: null,
        error: 'Invalid or missing CSRF token',
      });
      return;
    }
  }

  next();
}
