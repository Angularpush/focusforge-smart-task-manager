import cors from 'cors';
import { config } from '../config/environment';

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // In development, allow all origins
    if (config.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // In production, check against allowed origins
    const allowedOrigins = config.CORS_ORIGIN.split(',').map(origin => origin.trim());

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: config.CORS_CREDENTIALS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
    'X-API-Key',
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Rate-Limit-Limit',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',
    'Retry-After',
    'X-Request-ID',
    'X-User-ID',
  ],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204,
};

export const corsHandler = cors(corsOptions);

// CORS error handler
export function handleCorsError(
  error: Error,
  req: any,
  res: any,
  next: any
): void {
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'CORS_ERROR',
        message: 'Cross-origin request blocked',
        details: {
          origin: req.headers.origin,
          allowedOrigins: config.CORS_ORIGIN.split(','),
        },
      },
    });
  }

  next(error);
}

export default corsHandler;