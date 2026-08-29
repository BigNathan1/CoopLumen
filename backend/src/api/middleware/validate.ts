import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

/**
 * Returns middleware that validates `req.body` against a Zod schema. On success
 * the parsed (and coerced) value replaces `req.body`; on failure it responds
 * with 400 and a list of field errors.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Returns middleware that validates `req.params` against a Zod schema. On
 * success the parsed (and coerced) value replaces `req.params`; on failure it
 * responds with 400 and a list of field errors.
 */
export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }
    req.params = result.data as Record<string, string>;
    next();
  };
}

/**
 * Returns middleware that validates `req.query` against a Zod schema. On
 * success the parsed (and coerced) value replaces `req.query`; on failure it
 * responds with 400 and a list of field errors.
 */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }
    req.query = result.data as Record<
      string,
      string | string[] | import('qs').ParsedQs | import('qs').ParsedQs[]
    >;
    next();
  };
}
