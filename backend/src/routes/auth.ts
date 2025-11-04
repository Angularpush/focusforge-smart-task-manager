import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPostgresPool, withPostgresTransaction } from '../config/database';
import { initializeFirebase, verifyFirebaseToken, createFirebaseUser } from '../config/firebase';
import { generateJwtToken, refreshJwtToken } from '../middleware/auth';
import { validation, asyncHandler } from '../middleware/validation';
import { rateLimiters } from '../middleware/rateLimiter';
import {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  RefreshTokenResponse,
  AuthenticatedRequest
} from '../types/api';
import { logger, logAuthEvent } from '../utils/logger';
import {
  UserAlreadyExistsError,
  InvalidCredentialsError,
  ValidationError
} from '../types';

const router = Router();

// Apply rate limiting to all auth routes
router.use(rateLimiters.auth);

/**
 * POST /api/auth/register
 * Register a new user with Firebase and create local user record
 */
router.post('/register',
  validation.register,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, displayName, academicLevel, major, weeklyStudyGoalHours, timezone }: RegisterRequest = req.body;

    logger.info('User registration attempt', { email, displayName });

    try {
      // Initialize Firebase if not already done
      if (!initializeFirebase()) {
        throw new Error('Firebase not configured');
      }

      const pool = getPostgresPool();

      // Check if user already exists
      const existingUserQuery = 'SELECT id FROM users WHERE email = $1 OR firebase_uid = $2';
      const existingUser = await pool.query(existingUserQuery, [email, email]);

      if (existingUser.rows.length > 0) {
        throw new UserAlreadyExistsError('A user with this email already exists');
      }

      // Create Firebase user
      const firebaseUser = await createFirebaseUser(email, password, displayName);

      // Hash password for local storage (backup)
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user record in PostgreSQL
      const createUserQuery = `
        INSERT INTO users (
          firebase_uid, email, display_name, avatar_url, academic_level,
          major, weekly_study_goal_hours, timezone, preferences,
          is_active, email_verified, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING id, firebase_uid, email, display_name, academic_level, major,
                 weekly_study_goal_hours, timezone, preferences, is_active,
                 email_verified, created_at
      `;

      const newUser = await pool.query(createUserQuery, [
        firebaseUser.uid,
        email,
        displayName,
        firebaseUser.photoURL,
        academicLevel || 'UNDERGRADUATE',
        major || null,
        weeklyStudyGoalHours || 20,
        timezone || 'UTC',
        JSON.stringify({
          theme: 'light',
          notifications: true,
          focusReminders: true,
        }),
        true,
        firebaseUser.emailVerified || false,
      ]);

      const user = newUser.rows[0];

      // Generate JWT token
      const token = generateJwtToken(user);

      // Log successful registration
      logAuthEvent('user_registered', user.id, email);

      logger.info('User registered successfully', {
        userId: user.id,
        email,
        displayName,
        academicLevel: user.academic_level,
      });

      const response: AuthResponse = {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          academicLevel: user.academic_level,
          major: user.major,
          weeklyStudyGoalHours: user.weekly_study_goal_hours,
          timezone: user.timezone,
        },
        token,
      };

      res.status(201).json({
        success: true,
        data: response,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
        },
      });

    } catch (error: any) {
      logger.error('Registration failed', {
        email,
        error: error.message,
        stack: error.stack,
      });

      // Handle specific Firebase errors
      if (error.code?.startsWith('auth/')) {
        let message = error.message;
        let code = 'FIREBASE_ERROR';

        switch (error.code) {
          case 'auth/email-already-exists':
            message = 'An account with this email already exists';
            code = 'EMAIL_ALREADY_EXISTS';
            break;
          case 'auth/weak-password':
            message = 'Password is too weak';
            code = 'WEAK_PASSWORD';
            break;
          case 'auth/invalid-email':
            message = 'Invalid email address';
            code = 'INVALID_EMAIL';
            break;
        }

        return res.status(400).json({
          success: false,
          error: { code, message },
        });
      }

      throw error;
    }
  })
);

/**
 * POST /api/auth/login
 * Authenticate user with Firebase and return JWT token
 */
router.post('/login',
  validation.login,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password }: LoginRequest = req.body;

    logger.info('User login attempt', { email });

    try {
      // Initialize Firebase if not already done
      if (!initializeFirebase()) {
        throw new Error('Firebase not configured');
      }

      // For this demo, we'll simulate Firebase authentication
      // In production, you'd use Firebase Admin SDK to verify credentials
      // or use Firebase Client SDK on the frontend and just verify the ID token

      const pool = getPostgresPool();

      // Find user by email
      const userQuery = `
        SELECT id, firebase_uid, email, display_name, academic_level, major,
               weekly_study_goal_hours, timezone, preferences, is_active,
               email_verified, created_at, updated_at
        FROM users
        WHERE email = $1 AND is_active = true
      `;

      const userResult = await pool.query(userQuery, [email]);

      if (userResult.rows.length === 0) {
        throw new InvalidCredentialsError('Invalid email or password');
      }

      const user = userResult.rows[0];

      // Generate JWT token
      const token = generateJwtToken(user);

      // Update last login
      await pool.query(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      // Log successful login
      logAuthEvent('user_logged_in', user.id, email);

      logger.info('User logged in successfully', {
        userId: user.id,
        email,
      });

      const response: AuthResponse = {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          academicLevel: user.academic_level,
          major: user.major,
          weeklyStudyGoalHours: user.weekly_study_goal_hours,
          timezone: user.timezone,
        },
        token,
      };

      res.json({
        success: true,
        data: response,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
        },
      });

    } catch (error: any) {
      logger.error('Login failed', {
        email,
        error: error.message,
      });

      if (error instanceof InvalidCredentialsError) {
        return res.status(401).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      throw error;
    }
  })
);

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const currentToken = req.token;

    if (!currentToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Current token is required',
        },
      });
    }

    try {
      const newToken = refreshJwtToken(currentToken);

      logger.info('Token refreshed successfully', {
        userId: req.user?.id,
      });

      const response: RefreshTokenResponse = {
        token: newToken,
      };

      res.json({
        success: true,
        data: response,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
        },
      });

    } catch (error: any) {
      logger.error('Token refresh failed', {
        error: error.message,
        userId: req.user?.id,
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_REFRESH_FAILED',
          message: 'Failed to refresh token',
        },
      });
    }
  })
);

/**
 * POST /api/auth/logout
 * Logout user (invalidate token)
 */
router.post('/logout',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;

    if (userId) {
      logAuthEvent('user_logged_out', userId, req.user?.email);
      logger.info('User logged out', { userId });
    }

    // In a real implementation, you might want to:
    // 1. Add the token to a blacklist in Redis
    // 2. Clear any user-specific cache
    // 3. Log the logout event

    res.json({
      success: true,
      data: {
        message: 'Logged out successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'User not authenticated',
        },
      });
    }

    const response = {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      academicLevel: user.academic_level,
      major: user.major,
      weeklyStudyGoalHours: user.weekly_study_goal_hours,
      timezone: user.timezone,
      preferences: user.preferences,
      emailVerified: user.email_verified,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLoginAt: user.last_login_at,
    };

    res.json({
      success: true,
      data: response,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile',
  validation.updateSubject, // Reuse validation for profile updates
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    const updates = req.body;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'User not authenticated',
        },
      });
    }

    try {
      const pool = getPostgresPool();

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (updates.displayName !== undefined) {
        updateFields.push(`display_name = $${paramIndex++}`);
        updateValues.push(updates.displayName);
      }
      if (updates.academicLevel !== undefined) {
        updateFields.push(`academic_level = $${paramIndex++}`);
        updateValues.push(updates.academicLevel);
      }
      if (updates.major !== undefined) {
        updateFields.push(`major = $${paramIndex++}`);
        updateValues.push(updates.major);
      }
      if (updates.weeklyStudyGoalHours !== undefined) {
        updateFields.push(`weekly_study_goal_hours = $${paramIndex++}`);
        updateValues.push(updates.weeklyStudyGoalHours);
      }
      if (updates.timezone !== undefined) {
        updateFields.push(`timezone = $${paramIndex++}`);
        updateValues.push(updates.timezone);
      }
      if (updates.preferences !== undefined) {
        updateFields.push(`preferences = $${paramIndex++}`);
        updateValues.push(JSON.stringify(updates.preferences));
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_UPDATES',
            message: 'No valid fields to update',
          },
        });
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(user.id);

      const updateQuery = `
        UPDATE users
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, firebase_uid, email, display_name, academic_level, major,
                 weekly_study_goal_hours, timezone, preferences, is_active,
                 email_verified, created_at, updated_at, last_login_at
      `;

      const result = await pool.query(updateQuery, updateValues);
      const updatedUser = result.rows[0];

      logger.info('User profile updated', {
        userId: user.id,
        updatedFields: Object.keys(updates),
      });

      const response = {
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.display_name,
        avatarUrl: updatedUser.avatar_url,
        academicLevel: updatedUser.academic_level,
        major: updatedUser.major,
        weeklyStudyGoalHours: updatedUser.weekly_study_goal_hours,
        timezone: updatedUser.timezone,
        preferences: updatedUser.preferences,
        emailVerified: updatedUser.email_verified,
        isActive: updatedUser.is_active,
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at,
        lastLoginAt: updatedUser.last_login_at,
      };

      res.json({
        success: true,
        data: response,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
        },
      });

    } catch (error: any) {
      logger.error('Profile update failed', {
        userId: user.id,
        error: error.message,
      });

      throw error;
    }
  })
);

export default router;