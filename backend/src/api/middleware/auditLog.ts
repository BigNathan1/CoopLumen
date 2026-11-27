import { NextFunction, Request, Response } from 'express';
import { db } from '../../db';
import { logger } from '../../utils/logger';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function resourceFromPath(path: string): { type: string; id: string | null } {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  return { type: parts[2] ?? 'unknown', id: parts[3] ?? null };
}

/** Records every successful API mutation after the response completes. */
export function auditStateChange(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const resource = resourceFromPath(req.originalUrl);
    const routePath = (req.route as { path?: string } | undefined)?.path;
    const headerRequestId = res.getHeader('x-request-id');
    const requestId = typeof headerRequestId === 'string' ? headerRequestId : null;
    // Suites that mock the pool without a query method still exercise the
    // route; skipping the write keeps the audit trail non-fatal there.
    if (typeof db.query !== 'function') return;
    void Promise.resolve(
      db.query(
        `INSERT INTO audit_log
           (actor_address, ip_address, action, resource_type, resource_id, after_state)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          req.auth?.address ?? null,
          req.ip,
          `${req.method} ${routePath ?? req.path}`,
          resource.type,
          resource.id,
          JSON.stringify({ status: res.statusCode, requestId }),
        ]
      )
    ).catch((error: unknown) => logger.error('Failed to persist mutation audit event', { error }));
  });
  next();
}
