import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

interface AppError extends Error {
  status?: number;
  statusCode?: number;
  response?: { status?: number };
}

/**
 * The Stellar SDK's Horizon errors (NotFoundError, BadRequestError,
 * BadResponseError) never set .status/.statusCode — they only carry the
 * real HTTP response on .response. Routes that call Horizon directly should
 * translate these via mapHorizonError before calling next(err), but this is
 * a defense-in-depth fallback so an unmapped Horizon error still returns its
 * real status (e.g. 404 for NotFoundError) instead of a blanket 500.
 */
function resolveStatus(err: AppError): number {
  if (err.status) return err.status;
  if (err.statusCode) return err.statusCode;
  if (err.name === 'NotFoundError') return 404;
  if (err.response?.status) return err.response.status;
  return 500;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = resolveStatus(err);
  const message = status === 500 ? 'Internal server error' : err.message;

  if (status === 500) {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
  }

  res.status(status).json({ data: null, error: message });
}
