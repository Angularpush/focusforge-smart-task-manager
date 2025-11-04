import { createClient, RedisClientType } from 'redis';
import { redisConfig, isDevelopment } from './environment';
import { logger } from '../utils/logger';

// Redis client instance
let redisClient: RedisClientType;

export async function connectRedis(): Promise<RedisClientType> {
  try {
    logger.info('Connecting to Redis...');

    redisClient = createClient({
      url: redisConfig.url,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true,
      },
      // Add password if provided
      ...(redisConfig.password && { password: redisConfig.password }),
    });

    // Error handling
    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
      logger.warn('Redis client disconnected');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    await redisClient.connect();

    // Test the connection
    await redisClient.ping();
    logger.info('Redis connected successfully');

    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis disconnected');
  }
}

// Redis Pub/Sub helpers
export class RedisPubSub {
  private publisher: RedisClientType;
  private subscriber: RedisClientType;

  constructor() {
    if (!redisClient) {
      throw new Error('Redis client not initialized');
    }

    // Create separate instances for publisher and subscriber
    this.publisher = redisClient.duplicate();
    this.subscriber = redisClient.duplicate();
  }

  async connect(): Promise<void> {
    await Promise.all([
      this.publisher.connect(),
      this.subscriber.connect(),
    ]);

    // Set up error handlers
    this.publisher.on('error', (err) => logger.error('Redis publisher error:', err));
    this.subscriber.on('error', (err) => logger.error('Redis subscriber error:', err));
  }

  async publish(channel: string, message: string): Promise<number> {
    return await this.publisher.publish(channel, message);
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel, (message) => {
      try {
        callback(message);
      } catch (error) {
        logger.error(`Error processing message on channel ${channel}:`, error);
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);
  }
}

// Redis cache helpers
export class RedisCache {
  private client: RedisClientType;

  constructor() {
    if (!redisClient) {
      throw new Error('Redis client not initialized');
    }
    this.client = redisClient;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      logger.error(`Error setting cache key ${key}:`, error);
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error(`Error deleting cache key ${key}:`, error);
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking cache key ${key}:`, error);
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error(`Error incrementing cache key ${key}:`, error);
      throw error;
    }
  }

  async incrBy(key: string, increment: number): Promise<number> {
    try {
      return await this.client.incrBy(key, increment);
    } catch (error) {
      logger.error(`Error incrementing cache key ${key}:`, error);
      throw error;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result;
    } catch (error) {
      logger.error(`Error setting expiry for cache key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Error getting TTL for cache key ${key}:`, error);
      return -1;
    }
  }
}

// Rate limiting helper
export class RedisRateLimiter {
  private client: RedisClientType;

  constructor() {
    if (!redisClient) {
      throw new Error('Redis client not initialized');
    }
    this.client = redisClient;
  }

  async isAllowed(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const now = Date.now();
      const window = Math.ceil(windowMs / 1000);
      const pipeline = this.client.multi();

      // Remove expired entries
      pipeline.zRemRangeByScore(key, 0, now - windowMs * 1000);

      // Count current entries
      pipeline.zCard(key);

      // Add current request
      pipeline.zAdd(key, { score: now, value: `${now}-${Math.random()}` });

      // Set expiry
      pipeline.expire(key, window);

      const results = await pipeline.exec();
      const count = results?.[1]?.[1] as number || 0;

      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetTime = now + windowMs;

      return { allowed, remaining, resetTime };
    } catch (error) {
      logger.error(`Rate limiting error for key ${key}:`, error);
      // Allow request on error (fail open)
      return { allowed: true, remaining: limit - 1, resetTime: Date.now() + windowMs };
    }
  }
}

// Health check
export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!redisClient) {
      return false;
    }
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
}

// Initialize Redis
export async function initializeRedis(): Promise<RedisClientType> {
  return await connectRedis();
}

// Graceful shutdown for Redis
export async function closeRedis(): Promise<void> {
  await disconnectRedis();
}

// Setup graceful shutdown for Redis
export function setupRedisGracefulShutdown(): void {
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, closing Redis connection...`);

    try {
      await closeRedis();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error during Redis shutdown:', error);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  if (isDevelopment) {
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon
  }
}

// Export singleton instances
export const redisCache = new RedisCache();
export const redisRateLimiter = new RedisRateLimiter();

// Export for backward compatibility
export { redisClient };