import rateLimit, { type RateLimitRequestHandler, type Store } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import RedisStore, { type RedisReply } from 'rate-limit-redis';
import { redisCache } from '../../cache/redis';
import { logger } from '../../utils/logger';

const isTest = process.env.NODE_ENV === 'test';

const isReadOnlyMethod = (method: string): boolean =>
  method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

/**
 * Redis-backed store that never takes the API down with it.
 *
 * `rate-limit-redis` loads its Lua scripts once, in `init`, and a rejection
 * there would leave the limiter permanently broken for the life of the
 * process. This subclass swallows an `init` failure and retries the script
 * load on the next request, so a Redis that comes up after the API (or blips
 * during a deploy) is picked up without a restart.
 */
class ResilientRedisStore extends RedisStore {
  private scriptsLoaded: Promise<void> | null = null;

  async init(options: Parameters<RedisStore['init']>[0]): Promise<void> {
    this.windowMs = options.windowMs;
    try {
      await this.ensureScripts();
    } catch {
      // Already logged; the next increment/get retries the load.
    }
  }

  async increment(key: string): ReturnType<RedisStore['increment']> {
    await this.ensureScripts();
    return super.increment(key);
  }

  async get(key: string): ReturnType<RedisStore['get']> {
    await this.ensureScripts();
    return super.get(key);
  }

  /** Loads the Lua scripts once; a failed load is forgotten so the next call retries. */
  private ensureScripts(): Promise<void> {
    this.scriptsLoaded ??= (async (): Promise<void> => {
      this.incrementScriptSha = this.loadIncrementScript();
      this.getScriptSha = this.loadGetScript();
      await Promise.all([this.incrementScriptSha, this.getScriptSha]);
    })().catch((error) => {
      this.scriptsLoaded = null;
      logger.warn('Rate limit store could not load Redis scripts', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
    return this.scriptsLoaded;
  }
}

/**
 * Returns a store for one limiter. Each limiter gets its own key prefix so
 * counters never collide, and so the slow-down and hard-limit windows for the
 * same route are counted independently. Falls back to the library's in-memory
 * store when REDIS_URL is not set (local development, single instance).
 */
export const createStore = (name: string): Store | undefined => {
  if (!redisCache.isConfigured()) return undefined;

  return new ResilientRedisStore({
    prefix: `rl:${name}:`,
    sendCommand: (...args: string[]) => redisCache.sendCommand(args) as Promise<RedisReply>,
  });
};

const TOO_MANY_REQUESTS = { data: null, error: 'Too many requests, please try again later' };

interface LimiterOptions {
  /** Unique name; becomes part of the Redis key prefix. */
  name: string;
  windowMs: number;
  max: number;
  /** When set, requests with a read-only method (GET/HEAD/OPTIONS) are not counted. */
  writesOnly?: boolean;
  /** Counts requests in the test environment too. Off by default so suites are not throttled. */
  enforceInTests?: boolean;
}

/**
 * Hard limit. If Redis is unreachable the request is let through
 * (`passOnStoreError`) and the failure is logged: a cache outage must not
 * become an API outage. The trade-off is that limits are not enforced while
 * Redis is down.
 */
export const createRateLimiter = ({
  name,
  windowMs,
  max,
  writesOnly = false,
  enforceInTests = false,
}: LimiterOptions): RateLimitRequestHandler =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore(name),
    passOnStoreError: true,
    skip: (req) => (isTest && !enforceInTests) || (writesOnly && isReadOnlyMethod(req.method)),
    message: TOO_MANY_REQUESTS,
  });

interface SlowDownOptions {
  name: string;
  windowMs: number;
  /** Requests per window that are served at full speed. */
  delayAfter: number;
  /** Delay added per request over `delayAfter`. */
  delayStepMs: number;
  /** Ceiling for the delay, kept below typical proxy timeouts. */
  maxDelayMs: number;
  writesOnly?: boolean;
  enforceInTests?: boolean;
}

/**
 * Graduated slowdown: after `delayAfter` requests in the window each further
 * request is delayed by one more `delayStepMs` than the last, up to
 * `maxDelayMs`. Place it in front of the matching hard limit, with `delayAfter`
 * below that limit's `max`, so clients are throttled before they are blocked.
 */
export const createSlowDown = ({
  name,
  windowMs,
  delayAfter,
  delayStepMs,
  maxDelayMs,
  writesOnly = false,
  enforceInTests = false,
}: SlowDownOptions): RateLimitRequestHandler =>
  slowDown({
    windowMs,
    delayAfter,
    delayMs: (used) => (used - delayAfter) * delayStepMs,
    maxDelayMs,
    store: createStore(`${name}:slow`),
    passOnStoreError: true,
    skip: (req) => (isTest && !enforceInTests) || (writesOnly && isReadOnlyMethod(req.method)),
  });

/** Limits write operations to 10 requests per minute per IP. Disabled in tests. */
export const writeLimiter = createRateLimiter({
  name: 'write',
  windowMs: 60 * 1000,
  max: 10,
  writesOnly: true,
});

/**
 * Limits all write requests under the communities resource to 10 requests per
 * minute per IP. Read-only requests are excluded so community reads are not
 * throttled by this protection.
 */
export const communityWriteLimiter = createRateLimiter({
  name: 'community-write',
  windowMs: 60 * 1000,
  max: 10,
  writesOnly: true,
});

/** Backstop for the whole API: 300 requests per minute per IP. */
export const apiLimiter = createRateLimiter({ name: 'api', windowMs: 60 * 1000, max: 300 });

/** Slows the whole API down gradually once a client passes 150 requests a minute. */
export const apiSlowDown = createSlowDown({
  name: 'api',
  windowMs: 60 * 1000,
  delayAfter: 150,
  delayStepMs: 50,
  maxDelayMs: 2000,
});

/**
 * Authentication endpoints: 20 requests per minute per IP. These are the
 * credential-guessing and challenge-flooding surface, so the limit is much
 * tighter than the API-wide one.
 */
export const authLimiter = createRateLimiter({ name: 'auth', windowMs: 60 * 1000, max: 20 });

/** Starts delaying auth requests after 5 a minute, ahead of the hard limit of 20. */
export const authSlowDown = createSlowDown({
  name: 'auth',
  windowMs: 60 * 1000,
  delayAfter: 5,
  delayStepMs: 250,
  maxDelayMs: 5000,
});

/**
 * Token endpoints build and submit Stellar transactions, which is expensive and
 * touches Horizon: 30 requests per minute per IP.
 */
export const tokenLimiter = createRateLimiter({ name: 'tokens', windowMs: 60 * 1000, max: 30 });

/** Starts delaying token requests after 10 a minute, ahead of the hard limit of 30. */
export const tokenSlowDown = createSlowDown({
  name: 'tokens',
  windowMs: 60 * 1000,
  delayAfter: 10,
  delayStepMs: 200,
  maxDelayMs: 4000,
});
