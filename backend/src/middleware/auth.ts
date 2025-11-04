import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { getPostgresPool } from '../config/database';
import { AuthenticatedRequest, JwtPayload, AuthError, InvalidTokenError, ExpiredTokenError } from '../types/auth';
import { logger } from '../utils/logger';

// JWT token verification
export function verifyJwtToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          reject(new ExpiredTokenError(err.message));
        } else if (err.name === 'JsonWebTokenError') {
          reject(new InvalidTokenError(err.message));
        } else {
          reject(new AuthError(err.message, 'TOKEN_VERIFICATION_FAILED'));
        }
      } else {
        resolve(decoded as JwtPayload);
      }
    });
  });
}

// Fetch user from database
async function getUserById(userId: string) {
  const pool = getPostgresPool();
  const query = `
    SELECT id, firebase_uid, email, display_name, avatar_url,
           academic_level, major, weekly_study_goal_hours, timezone,
           preferences, is_active, last_login_at, email_verified,
           created_at, updated_at
    FROM users
    WHERE id = $1 AND is_active = true
  `;

  const result = await pool.query(query, [userId]);
  return result.rows[0] || null;
}

// Authentication middleware
export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token required',
        },
      });
      return;
    }

    // Verify JWT token
    const payload = await verifyJwtToken(token);

    // Fetch user from database
    const user = await getUserById(payload.userId);

    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found or inactive',
        },
      });
      return;
    }

    // Attach user and token to request
    req.user = user;
    req.token = token;

    logger.debug('User authenticated successfully', {
      userId: user.id,
      email: user.email,
      requestId: req.headers['x-request-id'],
    });

    next();
  } catch (error) {
    logger.error('Authentication failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });

    if (error instanceof InvalidTokenError) {
      res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else if (error instanceof ExpiredTokenError) {
      res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication failed',
        },
      });
    }
  }
}

// Optional authentication (doesn't fail if no token)
export async function optionalAuthentication(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const payload = await verifyJwtToken(token);
      const user = await getUserById(payload.userId);

      if (user) {
        req.user = user;
        req.token = token;

        logger.debug('Optional authentication successful', {
          userId: user.id,
          email: user.email,
        });
      }
    }

    next();
  } catch (error) {
    // Log error but don't fail the request
    logger.warn('Optional authentication failed, proceeding without auth:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next();
  }
}

// Admin authentication middleware
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // First ensure user is authenticated
  if (!req.user) {
    return authenticateToken(req, res, next);
  }

  // Check if user is admin (you might want to add an 'is_admin' field to users table)
  // For now, we'll use a simple check - in production, you'd want proper role management
  const adminEmails = ['admin@focusforge.app', 'super@focusforge.app']; // Configure these properly

  if (!adminEmails.includes(req.user.email)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Admin access required',
      },
    });
    return;
  }

  logger.info('Admin access granted', {
    userId: req.user.id,
    email: req.user.email,
  });

  next();
}

// Rate limiting for authenticated users
export const authenticatedRateLimit = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
};

// Generate JWT token
export function generateJwtToken(user: any): string {
  const payload = {
    userId: user.id,
    email: user.email,
    firebaseUid: user.firebase_uid,
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRY,
    issuer: config.APP_NAME,
    audience: config.FRONTEND_URL,
  });
}

// Refresh JWT token
export function refreshJwtToken(oldToken: string): string {
  try {
    const decoded = jwt.decode(oldToken) as any;

    if (!decoded || !decoded.userId) {
      throw new Error('Invalid token structure');
    }

    // Create new token with same payload but new expiration
    const payload = {
      userId: decoded.userId,
      email: decoded.email,
      firebaseUid: decoded.firebaseUid,
    };

    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRY,
      issuer: config.APP_NAME,
      audience: config.FRONTEND_URL,
    });
  } catch (error) {
    throw new AuthError('Failed to refresh token', 'TOKEN_REFRESH_FAILED');
  }
}

// User context middleware
export function addUserContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Add user context to response headers for debugging
  if (req.user) {
    res.setHeader('X-User-ID', req.user.id);
    res.setHeader('X-User-Email', req.user.email);
  }

  next();
}

// Security headers middleware
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // CORS headers (if not handled by cors middleware)
  if (!res.getHeader('Access-Control-Allow-Origin')) {
    res.setHeader('Access-Control-Allow-Origin', config.CORS_ORIGIN);
  }

  next();
}

// Request logging middleware
export function logRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Log when request finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.logRequest(req, res, duration);
  });

  next();
}

// Request ID middleware
export function addRequestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string ||
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
}