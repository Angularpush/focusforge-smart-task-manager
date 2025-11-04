import { Router, Response } from 'express';
import { taskService } from '../services/taskService';
import { authenticateToken } from '../middleware/auth';
import { validation, asyncHandler } from '../middleware/validation';
import { rateLimiters } from '../middleware/rateLimiter';
import { apiLogger } from '../middleware/logger';
import {
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskListRequest,
  TaskResponse,
  AuthenticatedRequest
} from '../types/api';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication to all task routes
router.use(authenticateToken);

// Apply rate limiting for task operations
router.use(rateLimiters.tasks);

// Apply API logging
router.use(apiLogger('tasks'));

/**
 * GET /api/tasks
 * Get all tasks for the authenticated user with filtering, sorting, and pagination
 */
router.get('/',
  validation.pagination,
  validation.sorting,
  validation.taskFilters,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      status,
      subject,
      search,
      dateFrom,
      dateTo,
    } = req.query as any;

    logger.info('Fetching tasks', {
      userId: user.id,
      filters: { status, subject, search, dateFrom, dateTo },
      pagination: { page, limit },
      sort: { sortBy, sortOrder },
    });

    const result = await taskService.getTasks(
      user.id,
      { page, limit },
      { sortBy, sortOrder },
      { status, subject, search, dateFrom, dateTo }
    );

    // Transform tasks to response format
    const transformedTasks = result.data.map(task => ({
      id: task._id,
      title: task.title,
      description: task.description,
      subject: task.subject_id,
      deadline: task.deadline?.toISOString(),
      priority: task.priority,
      status: task.status,
      estimatedDurationMinutes: task.estimated_duration_minutes,
      actualDurationMinutes: task.actual_duration_minutes,
      aiScore: task.ai_score,
      tags: task.tags,
      naturalLanguageInput: task.natural_language_input,
      parsedMetadata: {
        confidence: task.parsed_metadata.confidence,
        extractedEntities: {
          deadline: task.parsed_metadata.entities.dates?.[0],
          subject: task.parsed_metadata.entities.subjects?.[0],
          priority: task.parsed_metadata.entities.priorities?.[0],
        },
      },
      aiSuggestions: task.ai_suggestions ? {
        bestTimeToStart: task.ai_suggestions.best_time_to_start?.toISOString(),
        recommendedBreakPoints: task.ai_suggestions.recommended_break_points,
      } : undefined,
      createdAt: task.created_at.toISOString(),
      updatedAt: task.updated_at.toISOString(),
      completedAt: task.completed_at?.toISOString(),
    }));

    const response = {
      data: transformedTasks,
      pagination: result.pagination,
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
 * GET /api/tasks/stats
 * Get task statistics for the authenticated user
 */
router.get('/stats',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Fetching task statistics', { userId: user.id });

    const stats = await taskService.getTaskStats(user.id);

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

/**
 * GET /api/tasks/:taskId
 * Get a specific task by ID
 */
router.get('/:taskId',
  validation.taskId,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { taskId } = req.params;

    logger.info('Fetching specific task', { userId: user.id, taskId });

    const task = await taskService.getTaskById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Task not found',
        },
      });
    }

    if (task.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Access denied',
        },
      });
    }

    const response: TaskResponse = {
      id: task._id,
      title: task.title,
      description: task.description,
      subject: task.subject_id,
      deadline: task.deadline?.toISOString(),
      priority: task.priority,
      status: task.status,
      estimatedDurationMinutes: task.estimated_duration_minutes,
      actualDurationMinutes: task.actual_duration_minutes,
      aiScore: task.ai_score,
      tags: task.tags,
      naturalLanguageInput: task.natural_language_input,
      parsedMetadata: {
        confidence: task.parsed_metadata.confidence,
        extractedEntities: {
          deadline: task.parsed_metadata.entities.dates?.[0],
          subject: task.parsed_metadata.entities.subjects?.[0],
          priority: task.parsed_metadata.entities.priorities?.[0],
        },
      },
      aiSuggestions: task.ai_suggestions ? {
        bestTimeToStart: task.ai_suggestions.best_time_to_start?.toISOString(),
        recommendedBreakPoints: task.ai_suggestions.recommended_break_points,
      } : undefined,
      createdAt: task.created_at.toISOString(),
      updatedAt: task.updated_at.toISOString(),
      completedAt: task.completed_at?.toISOString(),
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
 * POST /api/tasks
 * Create a new task (supports both natural language and structured input)
 */
router.post('/',
  validation.createTask,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const taskData: CreateTaskRequest = req.body;

    logger.info('Creating new task', {
      userId: user.id,
      naturalLanguageInput: taskData.naturalLanguageInput,
      title: taskData.title,
    });

    const newTask = await taskService.createTask(user.id, {
      user_id: user.id,
      natural_language_input: taskData.naturalLanguageInput || '',
      title: taskData.title || '',
      description: taskData.description,
      subject_id: taskData.subject,
      deadline: taskData.deadline ? new Date(taskData.deadline) : undefined,
      priority: taskData.priority as any,
      estimated_duration_minutes: taskData.estimatedDurationMinutes,
      tags: [],
    });

    const response: TaskResponse = {
      id: newTask._id,
      title: newTask.title,
      description: newTask.description,
      subject: newTask.subject_id,
      deadline: newTask.deadline?.toISOString(),
      priority: newTask.priority,
      status: newTask.status,
      estimatedDurationMinutes: newTask.estimated_duration_minutes,
      actualDurationMinutes: newTask.actual_duration_minutes,
      aiScore: newTask.ai_score,
      tags: newTask.tags,
      naturalLanguageInput: newTask.natural_language_input,
      parsedMetadata: {
        confidence: newTask.parsed_metadata.confidence,
        extractedEntities: {
          deadline: newTask.parsed_metadata.entities.dates?.[0],
          subject: newTask.parsed_metadata.entities.subjects?.[0],
          priority: newTask.parsed_metadata.entities.priorities?.[0],
        },
      },
      aiSuggestions: newTask.ai_suggestions ? {
        bestTimeToStart: newTask.ai_suggestions.best_time_to_start?.toISOString(),
        recommendedBreakPoints: newTask.ai_suggestions.recommended_break_points,
      } : undefined,
      createdAt: newTask.created_at.toISOString(),
      updatedAt: newTask.updated_at.toISOString(),
      completedAt: newTask.completed_at?.toISOString(),
    };

    res.status(201).json({
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
 * PUT /api/tasks/:taskId
 * Update an existing task
 */
router.put('/:taskId',
  validation.taskId,
  validation.updateTask,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { taskId } = req.params;
    const updates: UpdateTaskRequest = req.body;

    logger.info('Updating task', {
      userId: user.id,
      taskId,
      updates: Object.keys(updates),
    });

    const updatedTask = await taskService.updateTask(taskId, user.id, {
      title: updates.title,
      description: updates.description,
      subject_id: updates.subject,
      deadline: updates.deadline ? new Date(updates.deadline) : undefined,
      priority: updates.priority as any,
      status: updates.status as any,
      estimated_duration_minutes: updates.estimatedDurationMinutes,
      actual_duration_minutes: updates.actualDurationMinutes,
      tags: updates.tags,
      ai_suggestions: updates.aiSuggestions ? {
        best_time_to_start: updates.aiSuggestions.bestTimeToStart
          ? new Date(updates.aiSuggestions.bestTimeToStart)
          : undefined,
        recommended_break_points: updates.aiSuggestions.recommendedBreakPoints,
        estimated_difficulty: updates.aiSuggestions.estimatedDifficulty,
      } : undefined,
      ai_score: updates.aiScore,
    });

    const response: TaskResponse = {
      id: updatedTask._id,
      title: updatedTask.title,
      description: updatedTask.description,
      subject: updatedTask.subject_id,
      deadline: updatedTask.deadline?.toISOString(),
      priority: updatedTask.priority,
      status: updatedTask.status,
      estimatedDurationMinutes: updatedTask.estimated_duration_minutes,
      actualDurationMinutes: updatedTask.actual_duration_minutes,
      aiScore: updatedTask.ai_score,
      tags: updatedTask.tags,
      naturalLanguageInput: updatedTask.natural_language_input,
      parsedMetadata: {
        confidence: updatedTask.parsed_metadata.confidence,
        extractedEntities: {
          deadline: updatedTask.parsed_metadata.entities.dates?.[0],
          subject: updatedTask.parsed_metadata.entities.subjects?.[0],
          priority: updatedTask.parsed_metadata.entities.priorities?.[0],
        },
      },
      aiSuggestions: updatedTask.ai_suggestions ? {
        bestTimeToStart: updatedTask.ai_suggestions.best_time_to_start?.toISOString(),
        recommendedBreakPoints: updatedTask.ai_suggestions.recommended_break_points,
      } : undefined,
      createdAt: updatedTask.created_at.toISOString(),
      updatedAt: updatedTask.updated_at.toISOString(),
      completedAt: updatedTask.completed_at?.toISOString(),
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
 * DELETE /api/tasks/:taskId
 * Delete (soft delete) a task
 */
router.delete('/:taskId',
  validation.taskId,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { taskId } = req.params;

    logger.info('Deleting task', { userId: user.id, taskId });

    await taskService.deleteTask(taskId, user.id);

    res.status(204).send();
  })
);

/**
 * POST /api/tasks/:taskId/complete
 * Mark a task as completed
 */
router.post('/:taskId/complete',
  validation.taskId,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { taskId } = req.params;

    logger.info('Completing task', { userId: user.id, taskId });

    const completedTask = await taskService.completeTask(taskId, user.id);

    const response = {
      id: completedTask._id,
      status: completedTask.status,
      completedAt: completedTask.completed_at?.toISOString(),
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
 * POST /api/tasks/batch
 * Batch operations on multiple tasks
 */
router.post('/batch',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { taskIds, operation, data } = req.body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BATCH_REQUEST',
          message: 'Task IDs array is required',
        },
      });
    }

    if (!operation || !['complete', 'delete', 'update'].includes(operation)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OPERATION',
          message: 'Operation must be one of: complete, delete, update',
        },
      });
    }

    logger.info('Batch task operation', {
      userId: user.id,
      operation,
      taskCount: taskIds.length,
    });

    const results = [];
    const errors = [];

    for (const taskId of taskIds) {
      try {
        let result;
        switch (operation) {
          case 'complete':
            result = await taskService.completeTask(taskId, user.id);
            break;
          case 'delete':
            await taskService.deleteTask(taskId, user.id);
            result = { id: taskId, deleted: true };
            break;
          case 'update':
            if (!data) {
              throw new Error('Update data is required for update operation');
            }
            result = await taskService.updateTask(taskId, user.id, data);
            break;
        }
        results.push(result);
      } catch (error) {
        errors.push({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const response = {
      processed: taskIds.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
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

export default router;