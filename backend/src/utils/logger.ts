import winston from 'winston';
import { config, isDevelopment } from '../config/environment';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // Add stack trace if available
    if (stack) {
      log += `\n${stack}`;
    }

    // Add metadata if available and in development
    if (Object.keys(meta).length > 0 && isDevelopment) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  defaultMeta: {
    service: config.APP_NAME,
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: config.LOG_FORMAT === 'json'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
    }),

    // File transport (if enabled)
    ...(config.LOG_FILE_ENABLED ? [
      new winston.transports.File({
        filename: config.LOG_FILE_PATH,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true,
      }),
      new winston.transports.File({
        filename: config.LOG_FILE_PATH.replace('.log', '-error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true,
      }),
    ] : []),
  ],

  // Exception handling
  exceptionHandlers: [
    ...(config.LOG_FILE_ENABLED ? [
      new winston.transports.File({
        filename: config.LOG_FILE_PATH.replace('.log', '-exceptions.log'),
      }),
    ] : []),
  ],

  // Rejection handling
  rejectionHandlers: [
    ...(config.LOG_FILE_ENABLED ? [
      new winston.transports.File({
        filename: config.LOG_FILE_PATH.replace('.log', '-rejections.log'),
      }),
    ] : []),
  ],
});

// Add request logging helper
export const logRequest = (req: any, res: any, responseTime?: number) => {
  const logData = {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.id,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
  };

  if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Add error logging helper
export const logError = (error: Error, context?: any) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    ...context,
  });
};

// Add database logging helpers
export const logDatabaseQuery = (query: string, duration?: number, error?: Error) => {
  const logData = {
    query: query.substring(0, 200), // Limit query length
    duration: duration ? `${duration}ms` : undefined,
  };

  if (error) {
    logger.error('Database Query Failed', { ...logData, error: error.message });
  } else {
    logger.debug('Database Query', logData);
  }
};

// Add WebSocket logging helpers
export const logWebSocketEvent = (event: string, socketId: string, data?: any) => {
  logger.info('WebSocket Event', {
    event,
    socketId,
    data: data ? JSON.stringify(data).substring(0, 500) : undefined,
  });
};

// Add authentication logging helpers
export const logAuthEvent = (event: string, userId?: string, email?: string, error?: Error) => {
  const logData = {
    event,
    userId,
    email,
  };

  if (error) {
    logger.error('Authentication Event Failed', { ...logData, error: error.message });
  } else {
    logger.info('Authentication Event', logData);
  }
};

// Add AI service logging helpers
export const logAIEvent = (event: string, userId?: string, data?: any, error?: Error) => {
  const logData = {
    event,
    userId,
    data: data ? JSON.stringify(data).substring(0, 500) : undefined,
  };

  if (error) {
    logger.error('AI Service Event Failed', { ...logData, error: error.message });
  } else {
    logger.info('AI Service Event', logData);
  }
};

// Development logger with colors
if (isDevelopment) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        let log = `${timestamp} ${level}: ${message}`;
        if (stack) {
          log += `\n${stack}`;
        }
        return log;
      })
    ),
  }));
}

// Create child logger with additional context
export const createChildLogger = (service: string, additionalContext?: any) => {
  return logger.child({
    service,
    ...additionalContext,
  });
};

// Export the main logger
export default logger;

// Export convenience functions
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);