import { createClient } from 'redis';
import { logger } from '../utils/logger';

type RedisClient = ReturnType<typeof createClient>;

class RedisCacheClient {
  private client: RedisClient | null = null;
  private connectPromise: Promise<RedisClient | null> | null = null;
  private hasLoggedDisabledState = false;

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

    const client = createClient({ url: process.env.REDIS_URL });
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
