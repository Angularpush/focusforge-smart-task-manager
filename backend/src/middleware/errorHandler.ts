import { Request, Response, NextFunction } from 'express';
import { config } from '../config/environment';
import { AppError, logger, logError } from '../utils/logger';
import { AuthenticatedRequest } from '../types/auth';

// Error response interface
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    path?: string;
    method?: string;
  };
}

// Main error handler middleware
export function errorHandler(
  error: Error,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Log the error
  logError(error, {
    requestId: req.headers['x-request-id'],
    userId: req.user?.id,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Determine if error is operational
  const isOperational = error instanceof AppError ? error.isOperational : false;

  // Prepare error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
      message: error.message,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string,
      path: req.path,
      method: req.method,
    },
  };

  // Add stack trace in development
  if (config.NODE_ENV === 'development') {
    errorResponse.error.stack = error.stack;
    errorResponse.error.details = error instanceof AppError ? error.context : undefined;
  }

  // Add additional context for specific error types
  if (error instanceof AppError) {
    errorResponse.error.details = error.context;
  }

  // Determine HTTP status code
  let statusCode = 500;
  if (error instanceof AppError) {
    statusCode = error.statusCode;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
  } else if (error.name === 'ForbiddenError') {
    statusCode = 403;
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
  } else if (error.name === 'ConflictError') {
    statusCode = 409;
  }

  // Handle specific error types
  switch (error.name) {
    case 'ValidationError':
      handleValidationError(error as any, errorResponse);
      break;

    case 'MongoError':
      handleMongoError(error as any, errorResponse);
      break;

    case 'PostgresError':
      handlePostgresError(error as any, errorResponse);
      break;

    case 'RedisError':
      handleRedisError(error as any, errorResponse);
      break;

    case 'FirebaseError':
      handleFirebaseError(error as any, errorResponse);
      break;

    default:
      handleGenericError(error, errorResponse);
  }

  // Don't leak error details in production for non-operational errors
  if (config.NODE_ENV === 'production' && !isOperational) {
    errorResponse.error.message = 'An internal error occurred';
    delete errorResponse.error.details;
    delete errorResponse.error.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

// Validation error handler
function handleValidationError(error: any, errorResponse: ErrorResponse): void {
  errorResponse.error.code = 'VALIDATION_ERROR';

  if (error.details && Array.isArray(error.details)) {
    // Joi validation error
    errorResponse.error.details = error.details.map((detail: any) => ({
      field: detail.path?.join('.'),
      message: detail.message,
      value: detail.context?.value,
    }));
  } else if (error.errors) {
    // Express-validator error
    errorResponse.error.details = Object.values(error.errors).map((err: any) => ({
      field: err.param,
      message: err.msg,
      value: err.value,
    }));
  }
}

// MongoDB error handler
function handleMongoError(error: any, errorResponse: ErrorResponse): void {
  switch (error.code) {
    case 11000:
      // Duplicate key error
      const field = Object.keys(error.keyValue || {})[0];
      errorResponse.error.code = 'DUPLICATE_KEY';
      errorResponse.error.message = `A record with this ${field} already exists`;
      errorResponse.error.details = { field, value: error.keyValue[field] };
      break;

    case 2:
      // Bad value error
      errorResponse.error.code = 'INVALID_VALUE';
      break;

    default:
      errorResponse.error.code = 'DATABASE_ERROR';
      errorResponse.error.message = 'A database error occurred';
  }
}

// PostgreSQL error handler
function handlePostgresError(error: any, errorResponse: ErrorResponse): void {
  switch (error.code) {
    case '23505':
      // Unique constraint violation
      const constraint = error.constraint;
      errorResponse.error.code = 'DUPLICATE_RECORD';
      errorResponse.error.message = 'A record with this value already exists';
      errorResponse.error.details = { constraint };
      break;

    case '23503':
      // Foreign key constraint violation
      errorResponse.error.code = 'FOREIGN_KEY_VIOLATION';
      errorResponse.error.message = 'Referenced record does not exist';
      break;

    case '23502':
      // Not null constraint violation
      errorResponse.error.code = 'REQUIRED_FIELD_MISSING';
      errorResponse.error.message = 'Required field is missing';
      errorResponse.error.details = { column: error.column };
      break;

    case '23514':
      // Check constraint violation
      errorResponse.error.code = 'CHECK_CONSTRAINT_VIOLATION';
      errorResponse.error.message = 'Data does not meet validation requirements';
      break;

    default:
      errorResponse.error.code = 'DATABASE_ERROR';
      errorResponse.error.message = 'A database error occurred';
  }
}

// Redis error handler
function handleRedisError(error: any, errorResponse: ErrorResponse): void {
  errorResponse.error.code = 'CACHE_ERROR';
  errorResponse.error.message = 'A cache error occurred';

  if (error.message.includes('ECONNREFUSED')) {
    errorResponse.error.code = 'CACHE_UNAVAILABLE';
    errorResponse.error.message = 'Cache service is temporarily unavailable';
  }
}

// Firebase error handler
function handleFirebaseError(error: any, errorResponse: ErrorResponse): void {
  switch (error.code) {
    case 'auth/user-not-found':
      errorResponse.error.code = 'USER_NOT_FOUND';
      errorResponse.error.message = 'User account not found';
      break;

    case 'auth/email-already-exists':
      errorResponse.error.code = 'EMAIL_ALREADY_EXISTS';
      errorResponse.error.message = 'An account with this email already exists';
      break;

    case 'auth/invalid-password':
      errorResponse.error.code = 'INVALID_PASSWORD';
      errorResponse.error.message = 'Invalid password';
      break;

    case 'auth/too-many-requests':
      errorResponse.error.code = 'TOO_MANY_REQUESTS';
      errorResponse.error.message = 'Too many authentication attempts, please try again later';
      break;

    default:
      errorResponse.error.code = 'AUTHENTICATION_ERROR';
      errorResponse.error.message = 'An authentication error occurred';
  }
}

// Generic error handler
function handleGenericError(error: Error, errorResponse: ErrorResponse): void {
  errorResponse.error.code = 'INTERNAL_ERROR';

  // Handle common error patterns
  if (error.message.includes('timeout')) {
    errorResponse.error.code = 'TIMEOUT_ERROR';
    errorResponse.error.message = 'Request timed out';
  } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
    errorResponse.error.code = 'NETWORK_ERROR';
    errorResponse.error.message = 'Network connection error';
  } else if (error.message.includes('ENOENT')) {
    errorResponse.error.code = 'FILE_NOT_FOUND';
    errorResponse.error.message = 'Required file not found';
  } else if (error.message.includes('EACCES')) {
    errorResponse.error.code = 'PERMISSION_DENIED';
    errorResponse.error.message = 'Permission denied';
  }
}

// Async error wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 404 handler
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const error = new Error(`Route ${req.method} ${req.path} not found`);
  (error as any).statusCode = 404;
  (error as any).code = 'NOT_FOUND';
  next(error);
}

// Process unhandled promise rejections
export function setupUnhandledRejectionHandler(): void {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
      promise,
      reason: reason instanceof Error ? reason.stack : reason,
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
      error: error.stack,
    });

    // Graceful shutdown
    logger.info('Shutting down due to uncaught exception...');
    process.exit(1);
  });
}

// Rate limit error handler
export function rateLimitHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'],
    },
  });
}

// Development error handler (with stack trace and more details)
export function developmentErrorHandler(
  error: Error,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (config.NODE_ENV !== 'development') {
    return next(error);
  }

  const errorResponse = {
    success: false,
    error: {
      code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
      message: error.message,
      stack: error.stack,
      details: error instanceof AppError ? error.context : undefined,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'],
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      body: req.body,
      query: req.query,
      headers: req.headers,
    },
  };

  res.status(error instanceof AppError ? error.statusCode : 500).json(errorResponse);
}