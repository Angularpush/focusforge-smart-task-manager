import { ObjectId } from 'mongodb';
import { getMongoConnection } from '../config/database';
import { redisCache } from '../config/redis';
import {
  FocusLog,
  CreateFocusLogInput,
  UpdateFocusLogInput,
  FocusStats,
  PaginatedResponse,
  PaginationParams
} from '../types/database';
import { logger } from '../utils/logger';
import { AppError } from '../types';

export class FocusService {
  private get focusCollection() {
    return getMongoConnection().collection('focus_logs');
  }

  private getCacheKey(userId: string, suffix: string = ''): string {
    return `focus:${userId}${suffix ? `:${suffix}` : ''}`;
  }

  async startFocusSession(userId: string, sessionData: {
    taskId?: string;
    durationMinutes: number;
    focusMode: 'POMODORO' | 'FREE_FORM';
    scheduledStart?: Date;
  }): Promise<{ sessionId: string; startedAt: Date; plannedDurationMinutes: number }> {
    try {
      logger.info('Starting focus session', {
        userId,
        taskId: sessionData.taskId,
        durationMinutes: sessionData.durationMinutes,
        focusMode: sessionData.focusMode,
      });

      const now = new Date();
      const sessionId = new ObjectId().toString();

      const newSession: Omit<FocusLog, '_id'> = {
        user_id: userId,
        session_start: now,
        session_end: undefined,
        duration_minutes: sessionData.durationMinutes,
        focus_quality: 'MEDIUM', // Default, will be updated when session ends
        task_worked_on: sessionData.taskId,
        interruptions: 0,
        notes: undefined,
        streak_count: await this.calculateStreakCount(userId),
        session_type: sessionData.focusMode,
        environment: undefined,
        background_noise: undefined,
        energy_level_before: undefined,
        energy_level_after: undefined,
        satisfaction_rating: undefined,
        created_at: now,
      };

      await this.focusCollection.insertOne(newSession as any);

      // Store active session in Redis for real-time tracking
      await redisCache.set(
        `active_session:${userId}`,
        {
          sessionId,
          startedAt: now,
          durationMinutes: sessionData.durationMinutes,
          taskId: sessionData.taskId,
          focusMode: sessionData.focusMode,
        },
        sessionData.durationMinutes * 60 + 300 // Duration + 5 minutes buffer
      );

      logger.info('Focus session started', {
        userId,
        sessionId,
        durationMinutes: sessionData.durationMinutes,
      });

      return {
        sessionId,
        startedAt: now,
        plannedDurationMinutes: sessionData.durationMinutes,
      };

    } catch (error) {
      logger.error('Failed to start focus session', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async endFocusSession(sessionId: string, userId: string, endData: {
    actualDurationMinutes: number;
    focusQuality: 'LOW' | 'MEDIUM' | 'HIGH';
    distractionsCount?: number;
    notes?: string;
    energyLevelBefore?: number;
    energyLevelAfter?: number;
    satisfactionRating?: number;
    environment?: string;
    backgroundNoise?: string;
  }): Promise<{
    sessionId: string;
    endedAt: Date;
    streakCount: number;
    weeklyTotalMinutes: number;
  }> {
    try {
      logger.info('Ending focus session', {
        userId,
        sessionId,
        actualDurationMinutes: endData.actualDurationMinutes,
        focusQuality: endData.focusQuality,
      });

      const now = new Date();

      // Update the session
      const updateData: UpdateFocusLogInput = {
        session_end: now,
        duration_minutes: endData.actualDurationMinutes,
        focus_quality: endData.focusQuality,
        interruptions: endData.distractionsCount || 0,
        notes: endData.notes,
        energy_level_before: endData.energyLevelBefore,
        energy_level_after: endData.energyLevelAfter,
        satisfaction_rating: endData.satisfactionRating,
        environment: endData.environment,
        background_noise: endData.backgroundNoise,
      };

      const result = await this.focusCollection.updateOne(
        { _id: new ObjectId(sessionId), user_id: userId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      }

      // Calculate new streak count
      const streakCount = await this.calculateStreakCount(userId);

      // Update streak count in the session
      await this.focusCollection.updateOne(
        { _id: new ObjectId(sessionId) },
        { $set: { streak_count: streakCount } }
      );

      // Calculate weekly total
      const weeklyTotal = await this.getWeeklyTotalMinutes(userId);

      // Remove from active sessions
      await redisCache.del(`active_session:${userId}`);

      // Clear user's focus cache
      await this.clearUserFocusCache(userId);

      logger.info('Focus session ended', {
        userId,
        sessionId,
        actualDurationMinutes: endData.actualDurationMinutes,
        streakCount,
        weeklyTotal,
      });

      return {
        sessionId,
        endedAt: now,
        streakCount,
        weeklyTotalMinutes: weeklyTotal,
      };

    } catch (error) {
      logger.error('Failed to end focus session', {
        userId,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getActiveSession(userId: string): Promise<any | null> {
    try {
      return await redisCache.get(`active_session:${userId}`);
    } catch (error) {
      logger.error('Failed to get active session', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  async getFocusSessions(
    userId: string,
    pagination: PaginationParams = {},
    startDate?: Date,
    endDate?: Date
  ): Promise<PaginatedResponse<FocusLog>> {
    try {
      const {
        page = 1,
        limit = 10,
        offset = ((page - 1) * limit)
      } = pagination;

      const cacheKey = this.getCacheKey(userId, `sessions:${JSON.stringify({ pagination, startDate, endDate })}`);

      // Try cache first
      const cached = await redisCache.get<PaginatedResponse<FocusLog>>(cacheKey);
      if (cached) {
        return cached;
      }

      // Build query
      const query: any = { user_id: userId };

      if (startDate || endDate) {
        query.session_start = {};
        if (startDate) {
          query.session_start.$gte = startDate;
        }
        if (endDate) {
          query.session_start.$lte = endDate;
        }
      }

      const [sessions, total] = await Promise.all([
        this.focusCollection
          .find(query)
          .sort({ session_start: -1 })
          .skip(offset)
          .limit(limit)
          .toArray(),
        this.focusCollection.countDocuments(query),
      ]);

      const paginatedResponse: PaginatedResponse<FocusLog> = {
        data: sessions as FocusLog[],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1,
        },
      };

      // Cache for 5 minutes
      await redisCache.set(cacheKey, paginatedResponse, 300);

      return paginatedResponse;

    } catch (error) {
      logger.error('Failed to get focus sessions', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getFocusStats(userId: string, period: 'DAY' | 'WEEK' | 'MONTH' = 'WEEK'): Promise<FocusStats> {
    try {
      const cacheKey = this.getCacheKey(userId, `stats:${period}`);

      // Try cache first
      const cached = await redisCache.get<FocusStats>(cacheKey);
      if (cached) {
        return cached;
      }

      const now = new Date();
      let startDate: Date;
      let groupBy: string;

      switch (period) {
        case 'DAY':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          groupBy = {
            $dateToString: {
              format: '%Y-%m-%d %H:00',
              date: '$session_start'
            }
          };
          break;
        case 'WEEK':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          groupBy = {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$session_start'
            }
          };
          break;
        case 'MONTH':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          groupBy = {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$session_start'
            }
          };
          break;
      }

      // Get overall stats
      const statsPipeline = [
        {
          $match: {
            user_id: userId,
            session_start: { $gte: startDate },
            session_end: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            totalMinutes: { $sum: '$duration_minutes' },
            avgDuration: { $avg: '$duration_minutes' },
            avgQuality: { $avg: { $switch: {
              branches: [
                { case: { $eq: ['$focus_quality', 'LOW'] }, then: 1 },
                { case: { $eq: ['$focus_quality', 'MEDIUM'] }, then: 2 },
                { case: { $eq: ['$focus_quality', 'HIGH'] }, then: 3 }
              ],
              default: 2
            }}}
          }
        }
      ];

      const overallStats = await this.focusCollection.aggregate(statsPipeline).toArray();

      // Get daily breakdown
      const dailyPipeline = [
        {
          $match: {
            user_id: userId,
            session_start: { $gte: startDate },
            session_end: { $exists: true }
          }
        },
        {
          $group: {
            _id: groupBy,
            sessionCount: { $sum: 1 },
            totalMinutes: { $sum: '$duration_minutes' },
            avgQuality: { $avg: { $switch: {
              branches: [
                { case: { $eq: ['$focus_quality', 'LOW'] }, then: 1 },
                { case: { $eq: ['$focus_quality', 'MEDIUM'] }, then: 2 },
                { case: { $eq: ['$focus_quality', 'HIGH'] }, then: 3 }
              ],
              default: 2
            }}}
          }
        },
        { $sort: { _id: 1 } }
      ];

      const dailyBreakdown = await this.focusCollection.aggregate(dailyPipeline).toArray();

      // Get current streak
      const currentStreak = await this.calculateStreakCount(userId);

      // Get longest streak
      const longestStreak = await this.getLongestStreak(userId);

      // Build response
      const stats = overallStats[0] || {
        totalSessions: 0,
        totalMinutes: 0,
        avgDuration: 0,
        avgQuality: 2,
      };

      // Convert average quality back to string
      let averageFocusQuality: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
      if (stats.avgQuality < 1.5) {
        averageFocusQuality = 'LOW';
      } else if (stats.avgQuality > 2.5) {
        averageFocusQuality = 'HIGH';
      }

      const response: FocusStats = {
        period,
        total_sessions_count: stats.totalSessions,
        total_focus_minutes: stats.totalMinutes,
        average_session_duration: Math.round(stats.avgDuration || 0),
        current_streak: currentStreak,
        longest_streak: longestStreak,
        average_focus_quality: averageFocusQuality,
        daily_breakdown: dailyBreakdown.map(day => ({
          date: day._id,
          sessionCount: day.sessionCount,
          totalMinutes: day.totalMinutes,
          averageQuality: day.avgQuality < 1.5 ? 'LOW' : day.avgQuality > 2.5 ? 'HIGH' : 'MEDIUM'
        })),
      };

      // Cache for 10 minutes
      await redisCache.set(cacheKey, response, 600);

      return response;

    } catch (error) {
      logger.error('Failed to get focus stats', {
        userId,
        period,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getSessionById(sessionId: string): Promise<FocusLog | null> {
    try {
      if (!ObjectId.isValid(sessionId)) {
        return null;
      }

      const session = await this.focusCollection.findOne({ _id: new ObjectId(sessionId) });
      return session as FocusLog || null;

    } catch (error) {
      logger.error('Failed to get session by ID', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Private helper methods

  private async calculateStreakCount(userId: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Look for sessions completed in the last few days
      const recentSessions = await this.focusCollection
        .find({
          user_id: userId,
          session_end: { $gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) }
        })
        .sort({ session_end: -1 })
        .limit(7)
        .toArray();

      if (recentSessions.length === 0) {
        return 0;
      }

      let streak = 0;
      const checkDate = new Date(today);

      // Check backwards from today
      for (let i = 0; i < 7; i++) {
        const dayStart = new Date(checkDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(checkDate);
        dayEnd.setHours(23, 59, 59, 999);

        const hasSessionOnDay = recentSessions.some(session => {
          const sessionDate = new Date(session.session_end!);
          return sessionDate >= dayStart && sessionDate <= dayEnd;
        });

        if (hasSessionOnDay) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (i > 0) {
          // Allow for missing today if we have previous days
          break;
        } else {
          // Check if today is not over yet
          const now = new Date();
          if (now < dayEnd) {
            // Still time today, don't break the streak
            streak = 0;
          }
        }
      }

      return streak;

    } catch (error) {
      logger.error('Failed to calculate streak count', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  private async getLongestStreak(userId: string): Promise<number> {
    try {
      // This is a simplified implementation
      // In production, you'd want a more sophisticated algorithm
      const sessions = await this.focusCollection
        .find({
          user_id: userId,
          session_end: { $exists: true }
        })
        .sort({ session_end: 1 })
        .toArray();

      let longestStreak = 0;
      let currentStreak = 0;
      let lastDate: Date | null = null;

      for (const session of sessions) {
        const sessionDate = new Date(session.session_end!);
        sessionDate.setHours(0, 0, 0, 0);

        if (lastDate) {
          const daysDiff = Math.floor((sessionDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff === 1) {
            currentStreak++;
          } else if (daysDiff > 1) {
            currentStreak = 1;
          }
        } else {
          currentStreak = 1;
        }

        longestStreak = Math.max(longestStreak, currentStreak);
        lastDate = sessionDate;
      }

      return longestStreak;

    } catch (error) {
      logger.error('Failed to get longest streak', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  private async getWeeklyTotalMinutes(userId: string): Promise<number> {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const pipeline = [
        {
          $match: {
            user_id: userId,
            session_start: { $gte: weekStart },
            session_end: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            totalMinutes: { $sum: '$duration_minutes' }
          }
        }
      ];

      const result = await this.focusCollection.aggregate(pipeline).toArray();
      return result[0]?.totalMinutes || 0;

    } catch (error) {
      logger.error('Failed to get weekly total minutes', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  private async clearUserFocusCache(userId: string): Promise<void> {
    // Clear all focus-related caches for this user
    await redisCache.del(this.getCacheKey(userId));
    await redisCache.del(this.getCacheKey(userId, 'stats:DAY'));
    await redisCache.del(this.getCacheKey(userId, 'stats:WEEK'));
    await redisCache.del(this.getCacheKey(userId, 'stats:MONTH'));
  }
}

export const focusService = new FocusService();