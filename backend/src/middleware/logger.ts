import morgan from 'morgan';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { Request, Response } from 'express';

// Custom morgan token for user ID
morgan.token('user-id', (req: any) => {
  return req.user?.id || 'anonymous';
});

// Custom morgan token for request ID
morgan.token('request-id', (req: any) => {
  return req.headers['x-request-id'] || 'none';
});

// Custom morgan token for response time in milliseconds
morgan.token('response-time-ms', (req: any, res: any) => {
  return res.responseTime || 0;
});

// Custom log format for development
const developmentLogFormat = ':method :url :status :response-time-ms ms - :user-id[:request-id] ":user-agent"';

// Custom log format for production (JSON)
const productionLogFormat = JSON.stringify({
  method: ':method',
  url: ':url',
  status: ':status',
  responseTime: ':response-time-ms',
  userId: ':user-id',
  requestId: ':request-id',
  userAgent: ':user-agent',
  ip: ':remote-addr',
  contentLength: ':res[content-length]',
  timestamp: ':date[iso]',
});

// Morgan configuration
export const morganConfig = {
  // Development format with colors
  development: morgan(developmentLogFormat, {
    stream: {
      write: (message: string) => {
        logger.info(message.trim(), {
          type: 'http_request',
        });
      },
    },
  }),

  // Production format (structured JSON)
  production: morgan(productionLogFormat, {
    stream: {
      write: (message: string) => {
        try {
          const logData = JSON.parse(message);
          logger.info('HTTP Request', {
            type: 'http_request',
            ...logData,
          });
        } catch (error) {
          logger.error('Failed to parse morgan log', { message, error });
        }
      },
    },
  }),
};

// Custom logger middleware
export function requestLogger(req: Request, res: Response, next: Function) {
  const startTime = Date.now();

  // Log request
  logger.info('HTTP Request Started', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: (req as any).user?.id,
    requestId: req.headers['x-request-id'],
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk: any, encoding?: any) {
    const duration = Date.now() - startTime;

    logger.info('HTTP Request Completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).user?.id,
      requestId: req.headers['x-request-id'],
      contentLength: res.get('Content-Length'),
    });

    originalEnd.call(this, chunk, encoding);
  };

  next();
}

// Error logger middleware
export function errorLogger(error: Error, req: Request, res: Response, next: Function) {
  logger.error('HTTP Request Error', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    error: error.message,
    stack: error.stack,
    userId: (req as any).user?.id,
    requestId: req.headers['x-request-id'],
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  next(error);
}

// API logger for specific endpoints
export function apiLogger(endpointName: string) {
  return (req: Request, res: Response, next: Function) => {
    const startTime = Date.now();

    logger.info(`API Request: ${endpointName}`, {
      method: req.method,
      url: req.url,
      userId: (req as any).user?.id,
      requestId: req.headers['x-request-id'],
      body: req.method !== 'GET' ? req.body : undefined,
      query: req.query,
    });

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      logger.info(`API Response: ${endpointName}`, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: (req as any).user?.id,
        requestId: req.headers['x-request-id'],
        contentLength: res.get('Content-Length'),
      });
    });

    next();
  };
}

// Performance logger for slow requests
export function performanceLogger(thresholdMs: number = 1000) {
  return (req: Request, res: Response, next: Function) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      if (duration > thresholdMs) {
        logger.warn('Slow Request Detected', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          threshold: `${thresholdMs}ms`,
          userId: (req as any).user?.id,
          requestId: req.headers['x-request-id'],
        });
      }
    });

    next();
  };
}

// Get appropriate morgan middleware based on environment
export function getMorganMiddleware() {
  if (config.NODE_ENV === 'development') {
    return morganConfig.development;
  } else {
    return morganConfig.production;
  }
}

export default {
  morganConfig,
  requestLogger,
  errorLogger,
  apiLogger,
  performanceLogger,
  getMorganMiddleware,
};