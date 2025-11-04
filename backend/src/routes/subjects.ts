import { Router, Response } from 'express';
import { getPostgresPool } from '../config/database';
import { redisCache } from '../config/redis';
import { authenticateToken } from '../middleware/auth';
import { validation, asyncHandler } from '../middleware/validation';
import { rateLimiters } from '../middleware/rateLimiter';
import { apiLogger } from '../middleware/logger';
import {
  CreateSubjectRequest,
  UpdateSubjectRequest,
  SubjectResponse,
  AuthenticatedRequest
} from '../types/api';
import { logger } from '../utils/logger';
import { AppError } from '../types';

const router = Router();

// Apply authentication to all subject routes
router.use(authenticateToken);

// Apply rate limiting
router.use(rateLimiters.tasks);

// Apply API logging
router.use(apiLogger('subjects'));

/**
 * GET /api/subjects
 * Get all subjects for the authenticated user
 */
router.get('/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Fetching subjects', { userId: user.id });

    // Try cache first
    const cacheKey = `subjects:${user.id}`;
    const cached = await redisCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
        },
      });
    }

    const pool = getPostgresPool();
    const query = `
      SELECT id, name, description, color_code, course_code, instructor,
             semester, credits, difficulty_level, priority_weight, is_active,
             created_at, updated_at
      FROM subjects
      WHERE user_id = $1
      ORDER BY priority_weight DESC, name ASC
    `;

    const result = await pool.query(query, [user.id]);
    const subjects = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      colorCode: row.color_code,
      courseCode: row.course_code,
      instructor: row.instructor,
      semester: row.semester,
      credits: row.credits,
      difficultyLevel: row.difficulty_level,
      priorityWeight: row.priority_weight,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));

    // Cache for 10 minutes
    await redisCache.set(cacheKey, subjects, 600);

    res.json({
      success: true,
      data: subjects,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * GET /api/subjects/:subjectId
 * Get a specific subject by ID
 */
router.get('/:subjectId',
  validation.subjectId,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { subjectId } = req.params;

    logger.info('Fetching specific subject', { userId: user.id, subjectId });

    const pool = getPostgresPool();
    const query = `
      SELECT id, name, description, color_code, course_code, instructor,
             semester, credits, difficulty_level, priority_weight, is_active,
             created_at, updated_at
      FROM subjects
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [subjectId, user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SUBJECT_NOT_FOUND',
          message: 'Subject not found',
        },
      });
    }

    const row = result.rows[0];
    const subject: SubjectResponse = {
      id: row.id,
      name: row.name,
      description: row.description,
      colorCode: row.color_code,
      courseCode: row.course_code,
      instructor: row.instructor,
      semester: row.semester,
      credits: row.credits,
      difficultyLevel: row.difficulty_level,
      priorityWeight: row.priority_weight,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };

    res.json({
      success: true,
      data: subject,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * POST /api/subjects
 * Create a new subject
 */
router.post('/',
  validation.createSubject,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const subjectData: CreateSubjectRequest = req.body;

    logger.info('Creating new subject', {
      userId: user.id,
      name: subjectData.name,
    });

    const pool = getPostgresPool();

    // Check if subject with same name already exists for this user
    const existingQuery = 'SELECT id FROM subjects WHERE user_id = $1 AND name = $2';
    const existing = await pool.query(existingQuery, [user.id, subjectData.name]);

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SUBJECT_ALREADY_EXISTS',
          message: 'A subject with this name already exists',
        },
      });
    }

    const query = `
      INSERT INTO subjects (
        user_id, name, description, color_code, course_code, instructor,
        semester, credits, difficulty_level, priority_weight, is_active,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING id, name, description, color_code, course_code, instructor,
                semester, credits, difficulty_level, priority_weight, is_active,
                created_at, updated_at
    `;

    const result = await pool.query(query, [
      user.id,
      subjectData.name,
      subjectData.description,
      subjectData.colorCode || '#3b82f6',
      subjectData.courseCode,
      subjectData.instructor,
      subjectData.semester,
      subjectData.credits,
      subjectData.difficultyLevel || 3,
      subjectData.priorityWeight || 1.0,
      subjectData.isActive !== undefined ? subjectData.isActive : true,
    ]);

    const row = result.rows[0];
    const subject: SubjectResponse = {
      id: row.id,
      name: row.name,
      description: row.description,
      colorCode: row.color_code,
      courseCode: row.course_code,
      instructor: row.instructor,
      semester: row.semester,
      credits: row.credits,
      difficultyLevel: row.difficulty_level,
      priorityWeight: row.priority_weight,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };

    // Clear cache
    await redisCache.del(`subjects:${user.id}`);

    res.status(201).json({
      success: true,
      data: subject,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * PUT /api/subjects/:subjectId
 * Update an existing subject
 */
router.put('/:subjectId',
  validation.subjectId,
  validation.updateSubject,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { subjectId } = req.params;
    const updates: UpdateSubjectRequest = req.body;

    logger.info('Updating subject', {
      userId: user.id,
      subjectId,
      updates: Object.keys(updates),
    });

    const pool = getPostgresPool();

    // Check if subject exists and belongs to user
    const checkQuery = 'SELECT id FROM subjects WHERE id = $1 AND user_id = $2';
    const existing = await pool.query(checkQuery, [subjectId, user.id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SUBJECT_NOT_FOUND',
          message: 'Subject not found',
        },
      });
    }

    // Check for name conflicts if name is being updated
    if (updates.name) {
      const nameCheckQuery = 'SELECT id FROM subjects WHERE user_id = $1 AND name = $2 AND id != $3';
      const nameConflict = await pool.query(nameCheckQuery, [user.id, updates.name, subjectId]);

      if (nameConflict.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SUBJECT_ALREADY_EXISTS',
            message: 'A subject with this name already exists',
          },
        });
      }
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    const updatableFields = [
      'name', 'description', 'colorCode', 'courseCode', 'instructor',
      'semester', 'credits', 'difficultyLevel', 'priorityWeight', 'isActive'
    ];

    updatableFields.forEach(field => {
      if (updates[field as keyof UpdateSubjectRequest] !== undefined) {
        const columnName = field.replace(/([A-Z])/g, '_$1').toLowerCase();
        updateFields.push(`${columnName} = $${paramIndex++}`);
        updateValues.push(updates[field as keyof UpdateSubjectRequest]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_UPDATES',
          message: 'No valid fields to update',
        },
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(subjectId);

    const updateQuery = `
      UPDATE subjects
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, description, color_code, course_code, instructor,
                semester, credits, difficulty_level, priority_weight, is_active,
                created_at, updated_at
    `;

    const result = await pool.query(updateQuery, updateValues);
    const row = result.rows[0];
    const subject: SubjectResponse = {
      id: row.id,
      name: row.name,
      description: row.description,
      colorCode: row.color_code,
      courseCode: row.course_code,
      instructor: row.instructor,
      semester: row.semester,
      credits: row.credits,
      difficultyLevel: row.difficulty_level,
      priorityWeight: row.priority_weight,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };

    // Clear cache
    await redisCache.del(`subjects:${user.id}`);

    res.json({
      success: true,
      data: subject,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * DELETE /api/subjects/:subjectId
 * Delete a subject (soft delete by setting is_active to false)
 */
router.delete('/:subjectId',
  validation.subjectId,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { subjectId } = req.params;

    logger.info('Deleting subject', { userId: user.id, subjectId });

    const pool = getPostgresPool();

    // Check if subject exists and belongs to user
    const checkQuery = 'SELECT id FROM subjects WHERE id = $1 AND user_id = $2';
    const existing = await pool.query(checkQuery, [subjectId, user.id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SUBJECT_NOT_FOUND',
          message: 'Subject not found',
        },
      });
    }

    // Soft delete by setting is_active to false
    await pool.query(
      'UPDATE subjects SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [subjectId]
    );

    // Clear cache
    await redisCache.del(`subjects:${user.id}`);

    res.status(204).send();
  })
);

/**
 * GET /api/subjects/stats
 * Get subject statistics for the authenticated user
 */
router.get('/stats',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Fetching subject statistics', { userId: user.id });

    const pool = getPostgresPool();

    // Get basic counts
    const countsQuery = `
      SELECT
        COUNT(*) as total_subjects,
        COUNT(*) FILTER (WHERE is_active = true) as active_subjects,
        AVG(difficulty_level) as avg_difficulty,
        AVG(priority_weight) as avg_priority_weight
      FROM subjects
      WHERE user_id = $1
    `;

    const countsResult = await pool.query(countsQuery, [user.id]);
    const counts = countsResult.rows[0];

    // Get subjects with most tasks (requires joining with MongoDB, simplified for now)
    const distributionQuery = `
      SELECT
        difficulty_level,
        COUNT(*) as count
      FROM subjects
      WHERE user_id = $1 AND is_active = true
      GROUP BY difficulty_level
      ORDER BY difficulty_level
    `;

    const distributionResult = await pool.query(distributionQuery, [user.id]);

    const stats = {
      totalSubjects: parseInt(counts.total_subjects),
      activeSubjects: parseInt(counts.active_subjects),
      averageDifficulty: parseFloat(counts.avg_difficulty) || 0,
      averagePriorityWeight: parseFloat(counts.avg_priority_weight) || 0,
      difficultyDistribution: distributionResult.rows.map(row => ({
        difficulty: row.difficulty_level,
        count: parseInt(row.count),
      })),
    };

    res.json({
      success: true,
      data: stats,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

export default router;