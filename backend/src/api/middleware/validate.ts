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
        error: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
