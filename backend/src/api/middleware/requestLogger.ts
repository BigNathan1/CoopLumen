import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

/** Logs method, path, status, and duration for every request via Winston. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request handled', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
}
