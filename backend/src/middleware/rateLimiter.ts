import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis';
import { config } from '../config/environment';
import { Request, Response } from 'express';

// Rate limit configuration for different endpoints
export const rateLimitConfig = {
  // General API rate limit
  general: {
    windowMs: parseInt(config.RATE_LIMIT_WINDOW_MS),
    max: parseInt(config.RATE_LIMIT_MAX_REQUESTS),
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: (() => {
      try {
        const redisClient = getRedisClient();
        return new RedisStore({
          sendCommand: (...args: string[]) => redisClient.call(...args),
        });
      } catch {
        return undefined;
      }
    })(),
  },

  // Authentication endpoints (more restrictive)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes
    message: {
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later.',
      },
    },
    skipSuccessfulRequests: true,
    store: (() => {
      try {
        const redisClient = getRedisClient();
        return new RedisStore({
          sendCommand: (...args: string[]) => redisClient.call(...args),
        });
      } catch {
        return undefined;
      }
    })(),
  },

  // Task endpoints
  tasks: {
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: {
      success: false,
      error: {
        code: 'TASK_RATE_LIMIT_EXCEEDED',
        message: 'Too many task operations, please try again later.',
      },
    },
    store: (() => {
      try {
        const redisClient = getRedisClient();
        return new RedisStore({
          sendCommand: (...args: string[]) => redisClient.call(...args),
        });
      } catch {
        return undefined;
      }
    })(),
  },

  // Chat endpoints (higher limit for real-time)
  chat: {
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    message: {
      success: false,
      error: {
        code: 'CHAT_RATE_LIMIT_EXCEEDED',
        message: 'Too many chat messages, please slow down.',
      },
    },
    store: (() => {
      try {
        const redisClient = getRedisClient();
        return new RedisStore({
          sendCommand: (...args: string[]) => redisClient.call(...args),
        });
      } catch {
        return undefined;
      }
    })(),
  },

  // Focus timer endpoints
  focus: {
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    message: {
      success: false,
      error: {
        code: 'FOCUS_RATE_LIMIT_EXCEEDED',
        message: 'Too many focus session operations, please try again later.',
      },
    },
    store: (() => {
      try {
        const redisClient = getRedisClient();
        return new RedisStore({
          sendCommand: (...args: string[]) => redisClient.call(...args),
        });
      } catch {
        return undefined;
      }
    })(),
  },

  // Analytics endpoints
  analytics: {
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: {
      success: false,
      error: {
        code: 'ANALYTICS_RATE_LIMIT_EXCEEDED',
        message: 'Too many analytics requests, please try again later.',
      },
    },
    store: (() => {
      try {
        const redisClient = getRedisClient();
        return new RedisStore({
          sendCommand: (...args: string[]) => redisClient.call(...args),
        });
      } catch {
        return undefined;
      }
    })(),
  },
};

// Create rate limiters
export const rateLimiters = {
  general: rateLimit(rateLimitConfig.general),
  auth: rateLimit(rateLimitConfig.auth),
  tasks: rateLimit(rateLimitConfig.tasks),
  chat: rateLimit(rateLimitConfig.chat),
  focus: rateLimit(rateLimitConfig.focus),
  analytics: rateLimit(rateLimitConfig.analytics),
};

// Custom rate limiter that differentiates between authenticated and unauthenticated users
export const createSmartRateLimiter = (
  authenticatedConfig: any,
  unauthenticatedConfig: any
) => {
  return rateLimit({
    windowMs: authenticatedConfig.windowMs,
    max: (req: Request) => {
      // More generous limits for authenticated users
      return (req as any).user ? authenticatedConfig.max : unauthenticatedConfig.max;
    },
    keyGenerator: (req: Request) => {
      // Use user ID for authenticated users, IP for unauthenticated
      return (req as any).user?.id || req.ip;
    },
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: (() => {
      try {
        const redisClient = getRedisClient();
        return new RedisStore({
          sendCommand: (...args: string[]) => redisClient.call(...args),
        });
      } catch {
        return undefined;
      }
    })(),
  });
};

// Smart rate limiter for general API
export const smartRateLimiter = createSmartRateLimiter(
  {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute for authenticated users
  },
  {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute for unauthenticated users
  }
);

// WebSocket rate limiting helper
export class WebSocketRateLimiter {
  private store = new Map<string, { count: number; resetTime: number }>();

  isAllowed(socketId: string, event: string, limit: number, windowMs: number): boolean {
    const key = `${socketId}:${event}`;
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetTime) {
      // First request or window reset
      this.store.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return true;
    }

    if (existing.count >= limit) {
      return false;
    }

    existing.count++;
    return true;
  }

  getRemainingRequests(socketId: string, event: string): number {
    const key = `${socketId}:${event}`;
    const existing = this.store.get(key);
    return existing ? Math.max(0, limit - existing.count) : limit;
  }

  getResetTime(socketId: string, event: string): number {
    const key = `${socketId}:${event}`;
    const existing = this.store.get(key);
    return existing ? existing.resetTime : 0;
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, data] of this.store.entries()) {
      if (now > data.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

// Global WebSocket rate limiter instance
export const wsRateLimiter = new WebSocketRateLimiter();

// Cleanup interval for WebSocket rate limiter
setInterval(() => {
  wsRateLimiter.cleanup();
}, 60000); // Cleanup every minute

// Rate limit headers helper
export function addRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetTime: number
): void {
  res.setHeader('RateLimit-Limit', limit.toString());
  res.setHeader('RateLimit-Remaining', remaining.toString());
  res.setHeader('RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
}

// Custom rate limit error handler
export function handleRateLimitError(
  req: Request,
  res: Response
): void {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
      details: {
        retryAfter: '60',
      },
    },
  });
}

export default {
  rateLimiters,
  smartRateLimiter,
  createSmartRateLimiter,
  WebSocketRateLimiter,
  wsRateLimiter,
  addRateLimitHeaders,
  handleRateLimitError,
};