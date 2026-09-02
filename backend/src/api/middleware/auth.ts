import { Request, Response, NextFunction } from 'express';
import { db } from '../../db';
import { verifySessionToken } from '../utils/sessionToken';
import { logger } from '../../utils/logger';

export interface AuthContext {
  /** The Stellar address that proved control of its key via /api/v1/auth/verify. */
  address: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Requires a valid `Authorization: Bearer <token>` session token, minted by
 * POST /api/v1/auth/verify after the caller signed a Freighter challenge.
 * On success, `req.auth.address` is the authenticated Stellar address.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ data: null, error: 'Authentication required' });
    return;
  }

  const payload = verifySessionToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ data: null, error: 'Invalid or expired session token' });
    return;
  }

  req.auth = { address: payload.address };
  next();
}

/**
 * Requires the authenticated address (set by {@link requireAuth}, which must
 * run first) to hold one of `roles` as an active member of the community
 * identified by `:id` in the route params.
 */
export function requireCommunityRole(roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ data: null, error: 'Authentication required' });
      return;
    }

    try {
      const [member] = await db.query<{ role: string }>(
        `SELECT role FROM members
         WHERE community_id = $1 AND stellar_address = $2 AND deleted_at IS NULL`,
        [req.params.id, req.auth.address]
      );

      if (!member || !roles.includes(member.role)) {
        res.status(403).json({
          data: null,
          error: `Requires community role: ${roles.join(' or ')}`,
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Addresses allowed to call operator-only routes, read once at startup from
 * ADMIN_ADDRESSES (comma-separated Stellar public keys).
 *
 * An unset or empty list means nobody qualifies. That is deliberate: an
 * unconfigured deployment should refuse operator actions rather than allow
 * them, which is what the previous no-op implementation did.
 */
function readAdminAddresses(): Set<string> {
  return new Set(
    (process.env.ADMIN_ADDRESSES ?? '')
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean)
  );
}

let adminAddresses: Set<string> | null = null;

/** Re-reads ADMIN_ADDRESSES. Exported for tests that set the variable per case. */
export function resetAdminAddressCache(): void {
  adminAddresses = null;
}

/**
 * Requires the authenticated address to be an operator of this deployment.
 *
 * Server-wide admin is not a community role - the routes it guards are not
 * scoped to a community - so membership is not consulted; the address must
 * appear in ADMIN_ADDRESSES. Mount it after {@link requireAuth}, which
 * populates `req.auth`.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ data: null, error: 'Authentication required' });
    return;
  }

  if (adminAddresses === null) {
    adminAddresses = readAdminAddresses();
    if (adminAddresses.size === 0) {
      logger.warn('ADMIN_ADDRESSES is unset; every operator route will reject with 403');
    }
  }

  if (!adminAddresses.has(req.auth.address)) {
    logger.warn('Rejected an operator request from a non-admin address', {
      address: req.auth.address,
      path: req.path,
    });
    res.status(403).json({ data: null, error: 'Requires operator privileges' });
    return;
  }

  next();
}
