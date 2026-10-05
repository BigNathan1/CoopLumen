import { createClient } from 'redis';
import { logger } from '../utils/logger';

/**
 * Single place the client is constructed, so the type below is derived from the
 * exact call rather than from `createClient`'s signature.
 *
 * `ReturnType<typeof createClient>` resolves the *default* type arguments
 * (RedisModules, RedisFunctions, RedisScripts, …), while calling it with no
 * explicit type arguments infers `<{}, {}, {}, 3, {}>`. Those two are the same
 * type in redis 4 but not in redis 6, so the alias and the call site stopped
 * agreeing. Taking ReturnType of this factory keeps them identical without
 * naming any of redis's generics, so it survives the next change to them too.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred on purpose, see above
function createRedisClient() {
  return createClient({ url: process.env.REDIS_URL });
}

type RedisClient = ReturnType<typeof createRedisClient>;

class RedisCacheClient {
  private client: RedisClient | null = null;
  private connectPromise: Promise<RedisClient | null> | null = null;
  private hasLoggedDisabledState = false;

  /**
   * Closes the connection if one was opened. Callers that need the process to
   * exit cleanly (tests, a graceful shutdown) must call this — an open Redis
   * socket keeps the Node event loop alive indefinitely.
   */
  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.connectPromise = null;
    if (!client) return;

    try {
      await client.quit();
    } catch (error) {
      logger.warn('Redis disconnect failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async get(key: string): Promise<string | null> {
    const client = await this.getClient();
    if (!client) return null;

    try {
      return await client.get(key);
    } catch (error) {
      logger.warn('Redis get failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    try {
      await client.setEx(key, ttlSeconds, value);
    } catch (error) {
      logger.warn('Redis set failed', {
        key,
        ttlSeconds,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async del(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    try {
      await client.del(key);
    } catch (error) {
      logger.warn('Redis delete failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async getClient(): Promise<RedisClient | null> {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (!process.env.REDIS_URL) {
      if (!this.hasLoggedDisabledState) {
        logger.warn('REDIS_URL is not configured; Redis-backed caching is disabled');
        this.hasLoggedDisabledState = true;
      }
      return null;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const client = createRedisClient();
    client.on('error', (error) => {
      logger.error('Redis client error', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    this.connectPromise = client
      .connect()
      .then(() => {
        this.client = client;
        return client;
      })
      .catch((error) => {
        logger.warn('Redis connection failed; cache operations will be skipped', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
      .finally(() => {
        this.connectPromise = null;
      });

    return this.connectPromise;
  }
}

export const redisCache = new RedisCacheClient();
