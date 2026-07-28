import { Request, Response, NextFunction } from 'express';
import { db } from '../../db';

interface IdempotencyRow {
  response_body: unknown;
  status_code: number;
}

/**
 * Replays the stored response for a previously seen Idempotency-Key on this
 * route, or records the response of a new request so a client retry after a
 * timeout cannot double-mint. No-op when the header is absent.
 */
export function idempotent(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header('Idempotency-Key');
    if (!key) {
      next();
      return;
    }

    try {
      const [existing] = await db.query<IdempotencyRow>(
        'SELECT response_body, status_code FROM idempotency_keys WHERE key = $1 AND endpoint = $2',
        [key, endpoint]
      );
      if (existing) {
        res.status(existing.status_code).json(existing.response_body);
        return;
      }

      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        if (res.statusCode < 500) {
          db.query(
            `INSERT INTO idempotency_keys (key, endpoint, response_body, status_code)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (key) DO NOTHING`,
            [key, endpoint, JSON.stringify(body), res.statusCode]
          ).catch(() => undefined);
        }
        return originalJson(body);
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
