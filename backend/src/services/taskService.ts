import { ObjectId } from 'mongodb';
import { getMongoConnection } from '../config/database';
import { redisCache } from '../config/redis';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStats,
  PaginatedResponse,
  PaginationParams,
  SortParams,
  FilterParams
} from '../types/database';
import { logger } from '../utils/logger';
import { AppError } from '../types';

export class TaskService {
  private get taskCollection() {
    return getMongoConnection().collection('tasks');
  }

  private getCacheKey(userId: string, suffix: string = ''): string {
    return `tasks:${userId}${suffix ? `:${suffix}` : ''}`;
  }

  async createTask(userId: string, taskData: CreateTaskInput): Promise<Task> {
    try {
      logger.info('Creating new task', { userId, title: taskData.title });

      const now = new Date();

      // Determine if this is natural language input or structured
      const isNaturalLanguage = !!taskData.natural_language_input && !taskData.title;

      let title, description, deadline, priority, estimatedDuration;

      if (isNaturalLanguage) {
        // For now, we'll create a basic structured task from natural language
        // In the next phase, this will call the AI service for parsing
        const parsed = await this.parseNaturalLanguageTask(taskData.natural_language_input);
        title = parsed.title;
        description = parsed.description;
        deadline = parsed.deadline;
        priority = parsed.priority;
        estimatedDuration = parsed.estimatedDurationMinutes || 60;
      } else {
        title = taskData.title;
        description = taskData.description;
        deadline = taskData.deadline;
        priority = taskData.priority || 'MEDIUM';
        estimatedDuration = taskData.estimated_duration_minutes || 60;
      }

      const newTask: Omit<Task, '_id'> = {
        user_id: userId,
        title,
        description,
        subject_id: taskData.subject_id,
        deadline: deadline ? new Date(deadline) : undefined,
        priority: priority as Task['priority'],
        status: 'PENDING',
        estimated_duration_minutes: estimatedDuration,
        actual_duration_minutes: undefined,
        dependencies: [],
        tags: taskData.tags || [],
        natural_language_input: taskData.natural_language_input || title,
        parsed_metadata: {
          confidence: isNaturalLanguage ? 0.8 : 1.0,
          entities: {
            dates: deadline ? [deadline] : [],
            subjects: taskData.subject_id ? [taskData.subject_id] : [],
            priorities: priority ? [priority] : [],
          },
        },
        ai_suggestions: {
          best_time_to_start: this.calculateBestStartTime(deadline),
          recommended_break_points: [60, 90], // Default break points
          estimated_difficulty: this.estimateDifficulty(title, description),
        },
        ai_score: this.calculateAIScore(priority, deadline, estimatedDuration),
        created_at: now,
        updated_at: now,
        completed_at: undefined,
      };

      const result = await this.taskCollection.insertOne(newTask as any);
      const createdTask = await this.getTaskById(result.insertedId.toString());

      if (!createdTask) {
        throw new AppError('Failed to retrieve created task', 500, 'TASK_CREATION_FAILED');
      }

      // Clear cache for user's tasks
      await this.clearUserTasksCache(userId);

      // Publish task creation event for AI service
      await this.publishTaskEvent('task_created', {
        taskId: createdTask._id,
        userId,
        naturalLanguageInput: taskData.natural_language_input,
      });

      logger.info('Task created successfully', {
        taskId: createdTask._id,
        userId,
        title: createdTask.title,
        priority: createdTask.priority,
      });

      return createdTask;

    } catch (error) {
      logger.error('Failed to create task', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getTasks(
    userId: string,
    pagination: PaginationParams = {},
    sort: SortParams = {},
    filters: FilterParams = {}
  ): Promise<PaginatedResponse<Task>> {
    try {
      const cacheKey = this.getCacheKey(userId, JSON.stringify({ pagination, sort, filters }));

      // Try to get from cache first
      const cached = await redisCache.get<PaginatedResponse<Task>>(cacheKey);
      if (cached) {
        logger.debug('Returning cached tasks for user', { userId });
        return cached;
      }

      const {
        page = 1,
        limit = 20,
        offset = ((page - 1) * limit)
      } = pagination;

      const {
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = sort;

      // Build query
      const query: any = { user_id: userId };

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.subject) {
        query.subject_id = filters.subject;
      }

      if (filters.search) {
        query.$text = { $search: filters.search };
      }

      if (filters.dateFrom || filters.dateTo) {
        query.deadline = {};
        if (filters.dateFrom) {
          query.deadline.$gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          query.deadline.$lte = new Date(filters.dateTo);
        }
      }

      // Build sort object
      const sortObj: any = {};
      sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query with pagination
      const [tasks, total] = await Promise.all([
        this.taskCollection
          .find(query)
          .sort(sortObj)
          .skip(offset)
          .limit(limit)
          .toArray(),
        this.taskCollection.countDocuments(query),
      ]);

      const paginatedResponse: PaginatedResponse<Task> = {
        data: tasks as Task[],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1,
        },
      };

      // Cache the response for 5 minutes
      await redisCache.set(cacheKey, paginatedResponse, 300);

      logger.debug('Retrieved tasks for user', {
        userId,
        count: tasks.length,
        total,
        page,
        filters,
      });

      return paginatedResponse;

    } catch (error) {
      logger.error('Failed to get tasks', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getTaskById(taskId: string): Promise<Task | null> {
    try {
      if (!ObjectId.isValid(taskId)) {
        return null;
      }

      const task = await this.taskCollection.findOne({ _id: new ObjectId(taskId) });
      return task as Task || null;

    } catch (error) {
      logger.error('Failed to get task by ID', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateTask(taskId: string, userId: string, updates: UpdateTaskInput): Promise<Task> {
    try {
      const existingTask = await this.getTaskById(taskId);

      if (!existingTask) {
        throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
      }

      if (existingTask.user_id !== userId) {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      const updateData: any = {
        ...updates,
        updated_at: new Date(),
      };

      // Handle status change to completed
      if (updates.status === 'COMPLETED' && existingTask.status !== 'COMPLETED') {
        updateData.completed_at = new Date();
        if (existingTask.estimated_duration_minutes) {
          updateData.actual_duration_minutes = existingTask.estimated_duration_minutes;
        }
      }

      // Update AI score if priority or deadline changed
      if (updates.priority || updates.deadline) {
        const newPriority = updates.priority || existingTask.priority;
        const newDeadline = updates.deadline || existingTask.deadline;
        updateData.ai_score = this.calculateAIScore(
          newPriority,
          newDeadline,
          existingTask.estimated_duration_minutes
        );
      }

      const result = await this.taskCollection.updateOne(
        { _id: new ObjectId(taskId) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
      }

      const updatedTask = await this.getTaskById(taskId);
      if (!updatedTask) {
        throw new AppError('Failed to retrieve updated task', 500, 'TASK_UPDATE_FAILED');
      }

      // Clear cache for user's tasks
      await this.clearUserTasksCache(userId);

      // Publish task update event
      await this.publishTaskEvent('task_updated', {
        taskId,
        userId,
        updates,
      });

      logger.info('Task updated successfully', {
        taskId,
        userId,
        updates: Object.keys(updates),
      });

      return updatedTask;

    } catch (error) {
      logger.error('Failed to update task', {
        taskId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async deleteTask(taskId: string, userId: string): Promise<void> {
    try {
      const existingTask = await this.getTaskById(taskId);

      if (!existingTask) {
        throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
      }

      if (existingTask.user_id !== userId) {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      // Soft delete by marking as cancelled
      await this.taskCollection.updateOne(
        { _id: new ObjectId(taskId) },
        {
          $set: {
            status: 'CANCELLED',
            updated_at: new Date(),
          }
        }
      );

      // Clear cache for user's tasks
      await this.clearUserTasksCache(userId);

      // Publish task deletion event
      await this.publishTaskEvent('task_deleted', {
        taskId,
        userId,
      });

      logger.info('Task deleted successfully', {
        taskId,
        userId,
      });

    } catch (error) {
      logger.error('Failed to delete task', {
        taskId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async completeTask(taskId: string, userId: string): Promise<Task> {
    return this.updateTask(taskId, userId, { status: 'COMPLETED' });
  }

  async getTaskStats(userId: string): Promise<TaskStats> {
    try {
      const cacheKey = this.getCacheKey(userId, 'stats');

      // Try cache first
      const cached = await redisCache.get<TaskStats>(cacheKey);
      if (cached) {
        return cached;
      }

      const pipeline = [
        // Match user's tasks
        { $match: { user_id: userId } },
        // Group by status
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgCompletionTime: {
              $avg: {
                $cond: [
                  { $ne: ['$actual_duration_minutes', null] },
                  '$actual_duration_minutes',
                  null
                ]
              }
            }
          }
        }
      ];

      const statusStats = await this.taskCollection.aggregate(pipeline).toArray();

      // Count overdue tasks
      const overdueCount = await this.taskCollection.countDocuments({
        user_id: userId,
        status: { $in: ['PENDING', 'IN_PROGRESS'] },
        deadline: { $lt: new Date() }
      });

      // Group by priority
      const priorityStats = await this.taskCollection.aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]).toArray();

      // Group by subject
      const subjectStats = await this.taskCollection.aggregate([
        { $match: { user_id: userId, subject_id: { $ne: null } } },
        { $group: { _id: '$subject_id', count: { $sum: 1 } } }
      ]).toArray();

      // Build stats object
      const stats: TaskStats = {
        total_tasks: 0,
        completed_tasks: 0,
        pending_tasks: 0,
        in_progress_tasks: 0,
        cancelled_tasks: 0,
        completion_rate: 0,
        average_completion_time: 0,
        tasks_by_priority: {},
        tasks_by_subject: {},
        overdue_tasks: overdueCount,
      };

      // Process status stats
      statusStats.forEach(stat => {
        stats.total_tasks += stat.count;
        switch (stat._id) {
          case 'COMPLETED':
            stats.completed_tasks = stat.count;
            stats.average_completion_time = stat.avgCompletionTime || 0;
            break;
          case 'PENDING':
            stats.pending_tasks = stat.count;
            break;
          case 'IN_PROGRESS':
            stats.in_progress_tasks = stat.count;
            break;
          case 'CANCELLED':
            stats.cancelled_tasks = stat.count;
            break;
        }
      });

      // Calculate completion rate
      stats.completion_rate = stats.total_tasks > 0
        ? stats.completed_tasks / stats.total_tasks
        : 0;

      // Process priority stats
      priorityStats.forEach(stat => {
        stats.tasks_by_priority[stat._id] = stat.count;
      });

      // Process subject stats
      subjectStats.forEach(stat => {
        stats.tasks_by_subject[stat._id] = stat.count;
      });

      // Cache stats for 10 minutes
      await redisCache.set(cacheKey, stats, 600);

      return stats;

    } catch (error) {
      logger.error('Failed to get task stats', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Private helper methods

  private async parseNaturalLanguageTask(input: string): Promise<{
    title: string;
    description?: string;
    deadline?: Date;
    priority?: string;
    estimatedDurationMinutes?: number;
  }> {
    // Basic parsing logic for now
    // In the next phase, this will call the AI service
    const lowerInput = input.toLowerCase();

    // Extract deadline
    let deadline: Date | undefined;
    const dateMatches = lowerInput.match(/by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)/i);
    if (dateMatches) {
      const day = dateMatches[1];
      const date = new Date();
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = daysOfWeek.indexOf(day);
      const currentDay = date.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
      date.setDate(date.getDate() + daysUntilTarget);
      date.setHours(23, 59, 59, 999);
      deadline = date;
    }

    // Extract priority
    let priority: string | undefined;
    if (lowerInput.includes('urgent') || lowerInput.includes('asap')) {
      priority = 'URGENT';
    } else if (lowerInput.includes('high')) {
      priority = 'HIGH';
    } else if (lowerInput.includes('low')) {
      priority = 'LOW';
    } else {
      priority = 'MEDIUM';
    }

    // Extract title (basic)
    const title = input.replace(/\b(by|for|before|after)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/gi, '').trim();

    return {
      title: title || input,
      deadline,
      priority,
      estimatedDurationMinutes: 60, // Default
    };
  }

  private calculateAIScore(
    priority: string,
    deadline?: Date,
    estimatedDuration?: number
  ): number {
    let score = 0.5; // Base score

    // Priority weighting
    const priorityWeights = {
      'LOW': 0.2,
      'MEDIUM': 0.5,
      'HIGH': 0.8,
      'URGENT': 1.0,
    };
    score += priorityWeights[priority as keyof typeof priorityWeights] * 0.4;

    // Deadline urgency
    if (deadline) {
      const hoursUntilDeadline = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilDeadline < 24) {
        score += 0.3; // Due within 24 hours
      } else if (hoursUntilDeadline < 72) {
        score += 0.2; // Due within 3 days
      } else if (hoursUntilDeadline < 168) {
        score += 0.1; // Due within a week
      }
    }

    // Duration factor (shorter tasks get slightly higher score)
    if (estimatedDuration) {
      if (estimatedDuration < 30) {
        score += 0.1;
      } else if (estimatedDuration > 180) {
        score -= 0.1;
      }
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  private calculateBestStartTime(deadline?: Date): Date | undefined {
    if (!deadline) return undefined;

    const now = new Date();
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    // If due soon, start now
    if (hoursUntilDeadline < 4) {
      return now;
    }

    // Otherwise, suggest a reasonable start time
    const startTime = new Date(now);
    startTime.setHours(9, 0, 0, 0); // 9 AM

    if (startTime < now) {
      startTime.setDate(startTime.getDate() + 1); // Tomorrow 9 AM
    }

    return startTime;
  }

  private estimateDifficulty(title: string, description?: string): number {
    const text = `${title} ${description || ''}`.toLowerCase();

    // Simple heuristics for difficulty estimation
    let difficulty = 3; // Default medium

    if (text.includes('easy') || text.includes('simple') || text.includes('quick')) {
      difficulty = 2;
    } else if (text.includes('hard') || text.includes('difficult') || text.includes('complex')) {
      difficulty = 4;
    } else if (text.includes('very hard') || text.includes('extremely') || text.includes('advanced')) {
      difficulty = 5;
    }

    // Adjust based on length (longer tasks might be more complex)
    const length = title.length + (description?.length || 0);
    if (length > 200) {
      difficulty = Math.min(5, difficulty + 1);
    }

    return difficulty;
  }

  private async clearUserTasksCache(userId: string): Promise<void> {
    // Clear all task-related caches for this user
    const pattern = this.getCacheKey(userId, '*');
    // Note: Redis doesn't support pattern matching in get commands directly
    // In production, you'd use SCAN or maintain a list of cache keys
    await redisCache.del(this.getCacheKey(userId));
    await redisCache.del(this.getCacheKey(userId, 'stats'));
  }

  private async publishTaskEvent(event: string, data: any): Promise<void> {
    try {
      // In the next phase, this will publish to Redis for AI service processing
      logger.info('Task event published', { event, data });
    } catch (error) {
      logger.error('Failed to publish task event', { event, error });
    }
  }
}

export const taskService = new TaskService();