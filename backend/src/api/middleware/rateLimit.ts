import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

const isReadOnlyMethod = (method: string): boolean =>
  method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

const createWriteLimiter = (): RateLimitRequestHandler =>
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

/**
 * Limits token issue requests to 3 per minute per authenticated user (or IP if unauthenticated).
 */
export const tokenIssueLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  validate: { default: false },
  keyGenerator: (req) => {
    if (req.headers.authorization) {
      return req.headers.authorization;
    }
    return req.ip ?? 'unknown';
  },
  message: { data: null, error: 'Too many requests, please try again later' },
});
