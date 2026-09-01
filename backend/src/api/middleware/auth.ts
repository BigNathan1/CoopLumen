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

let hasWarnedAboutOpenAdminRoutes = false;

/**
 * Admin gate for routes that accept a raw secret key or expose every token in
 * the system: GET /api/v1/tokens, POST /api/v1/tokens/issue and
 * POST /api/v1/tokens/trustline.
 *
 * It currently authorises nothing - every request passes. Anyone who can reach
 * the API can call those endpoints. The first call logs a warning so this
 * cannot sit unnoticed in a deployed environment; treat it as an open door
 * until it validates a credential and checks a role.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!hasWarnedAboutOpenAdminRoutes) {
    hasWarnedAboutOpenAdminRoutes = true;
    logger.warn('Admin routes are unauthenticated: requireAdmin lets every request through', {
      path: req.path,
    });
  }
  next();
}
