import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

/** Limits write operations to 10 requests per minute per IP. Disabled in tests. */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many requests, please try again later' },
});
