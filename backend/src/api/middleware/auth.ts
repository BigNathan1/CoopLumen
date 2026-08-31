import { Request, Response, NextFunction } from 'express';
import { db } from '../../db';
import { verifySessionToken } from '../utils/sessionToken';

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
 * Placeholder admin authentication middleware.
 * TODO: Replace with proper authentication/authorization when implemented.
 *
 * For now, this is a no-op that allows all requests through.
 * In a production system, this would:
 * 1. Validate JWT tokens or API keys
 * 2. Check user roles/permissions
 * 3. Return 401/403 for unauthorized access
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // TODO: Implement proper admin authentication
  // For now, allow all requests through as a placeholder
  next();
}
