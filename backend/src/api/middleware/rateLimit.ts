import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

const isReadOnlyMethod = (method: string): boolean =>
  method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

const createWriteLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isTest || isReadOnlyMethod(req.method),
    message: { data: null, error: 'Too many requests, please try again later' },
  });

/** Limits write operations to 10 requests per minute per IP. Disabled in tests. */
export const writeLimiter = createWriteLimiter();

/**
 * Limits all write requests under the communities resource to 10 requests per
 * minute per IP. Read-only requests are excluded so community reads are not
 * throttled by this protection.
 */
export const communityWriteLimiter = createWriteLimiter();
