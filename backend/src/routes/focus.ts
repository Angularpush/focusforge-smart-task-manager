import { Router, Response } from 'express';
import { focusService } from '../services/focusService';
import { authenticateToken } from '../middleware/auth';
import { validation, asyncHandler } from '../middleware/validation';
import { rateLimiters } from '../middleware/rateLimiter';
import { apiLogger } from '../middleware/logger';
import {
  StartFocusSessionRequest,
  EndFocusSessionRequest,
  FocusSessionResponse,
  FocusStatsResponse,
  FocusStatsRequest,
  FocusSessionListRequest,
  AuthenticatedRequest
} from '../types/api';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication to all focus routes
router.use(authenticateToken);

// Apply rate limiting for focus operations
router.use(rateLimiters.focus);

// Apply API logging
router.use(apiLogger('focus'));

/**
 * POST /api/focus/session/start
 * Start a new focus session
 */
router.post('/session/start',
  validation.startFocusSession,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const sessionData: StartFocusSessionRequest = req.body;

    logger.info('Starting focus session', {
      userId: user.id,
      taskId: sessionData.taskId,
      durationMinutes: sessionData.durationMinutes,
      focusMode: sessionData.focusMode,
    });

    const session = await focusService.startFocusSession(user.id, {
      taskId: sessionData.taskId,
      durationMinutes: sessionData.durationMinutes,
      focusMode: sessionData.focusMode,
      scheduledStart: sessionData.scheduledStart
        ? new Date(sessionData.scheduledStart)
        : undefined,
    });

    const response: FocusSessionResponse = {
      sessionId: session.sessionId,
      startedAt: session.startedAt.toISOString(),
      plannedDurationMinutes: session.plannedDurationMinutes,
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
 * POST /api/focus/session/:sessionId/end
 * End an active focus session
 */
router.post('/session/:sessionId/end',
  validation.sessionId,
  validation.endFocusSession,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { sessionId } = req.params;
    const endData: EndFocusSessionRequest = req.body;

    logger.info('Ending focus session', {
      userId: user.id,
      sessionId,
      actualDurationMinutes: endData.actualDurationMinutes,
      focusQuality: endData.focusQuality,
    });

    const result = await focusService.endFocusSession(sessionId, user.id, {
      actualDurationMinutes: endData.actualDurationMinutes,
      focusQuality: endData.focusQuality,
      distractionsCount: endData.distractionsCount,
      notes: endData.notes,
      energyLevelBefore: endData.energyLevelBefore,
      energyLevelAfter: endData.energyLevelAfter,
      satisfactionRating: endData.satisfactionRating,
      environment: endData.environment,
      backgroundNoise: endData.backgroundNoise,
    });

    const response: FocusSessionResponse = {
      sessionId: result.sessionId,
      startedAt: '', // Would need to fetch from session
      plannedDurationMinutes: 0, // Would need to fetch from session
      endedAt: result.endedAt.toISOString(),
      actualDurationMinutes: endData.actualDurationMinutes,
      focusQuality: endData.focusQuality,
      streakCount: result.streakCount,
      weeklyTotalMinutes: result.weeklyTotalMinutes,
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
 * GET /api/focus/session/active
 * Get the currently active focus session for the user
 */
router.get('/session/active',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Fetching active focus session', { userId: user.id });

    const activeSession = await focusService.getActiveSession(user.id);

    if (!activeSession) {
      return res.json({
        success: true,
        data: null,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
        },
      });
    }

    res.json({
      success: true,
      data: {
        sessionId: activeSession.sessionId,
        startedAt: activeSession.startedAt.toISOString(),
        durationMinutes: activeSession.durationMinutes,
        taskId: activeSession.taskId,
        focusMode: activeSession.focusMode,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * GET /api/focus/sessions
 * Get focus session history with pagination and filtering
 */
router.get('/sessions',
  validation.pagination,
  validation.dateRange,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const {
      page,
      limit,
      startDate,
      endDate,
    } = req.query as any;

    logger.info('Fetching focus sessions', {
      userId: user.id,
      pagination: { page, limit },
      dateRange: { startDate, endDate },
    });

    const result = await focusService.getFocusSessions(
      user.id,
      { page, limit },
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    // Transform sessions to response format
    const transformedSessions = result.data.map(session => ({
      id: session._id,
      taskId: session.task_worked_on,
      startedAt: session.session_start.toISOString(),
      endedAt: session.session_end?.toISOString(),
      durationMinutes: session.duration_minutes,
      focusQuality: session.focus_quality,
      sessionType: session.session_type,
      environment: session.environment,
      interruptions: session.interruptions,
      notes: session.notes,
      satisfactionRating: session.satisfaction_rating,
      energyLevelBefore: session.energy_level_before,
      energyLevelAfter: session.energy_level_after,
      streakCount: session.streak_count,
      createdAt: session.created_at.toISOString(),
    }));

    const response = {
      data: transformedSessions,
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
 * GET /api/focus/stats
 * Get focus statistics for the authenticated user
 */
router.get('/stats',
  validation.focusStatsPeriod,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { period = 'WEEK' } = req.query as FocusStatsRequest;

    logger.info('Fetching focus statistics', {
      userId: user.id,
      period,
    });

    const stats = await focusService.getFocusStats(user.id, period);

    const response: FocusStatsResponse = {
      period: stats.period,
      totalSessionsCount: stats.total_sessions_count,
      totalFocusMinutes: stats.total_focus_minutes,
      averageSessionDuration: stats.average_session_duration,
      currentStreak: stats.current_streak,
      longestStreak: stats.longest_streak,
      averageFocusQuality: stats.average_focus_quality,
      dailyBreakdown: stats.daily_breakdown,
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
 * GET /api/focus/stats/trends
 * Get focus trends for charting (extended period)
 */
router.get('/stats/trends',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { period = 'WEEK' } = req.query as any;

    logger.info('Fetching focus trends', {
      userId: user.id,
      period,
    });

    // Get stats for a longer period for trends
    const stats = await focusService.getFocusStats(user.id, period);

    // Transform for charting
    const trendData = stats.daily_breakdown.map(day => ({
      date: day.date,
      focusMinutes: day.totalMinutes,
      sessionCount: day.sessionCount,
      averageQuality: day.averageQuality,
    }));

    res.json({
      success: true,
      data: {
        data: trendData,
        period: stats.period,
        summary: {
          totalMinutes: stats.total_focus_minutes,
          totalSessions: stats.total_sessions_count,
          averageQuality: stats.average_focus_quality,
          currentStreak: stats.current_streak,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * GET /api/focus/session/:sessionId
 * Get a specific focus session by ID
 */
router.get('/session/:sessionId',
  validation.sessionId,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { sessionId } = req.params;

    logger.info('Fetching specific focus session', {
      userId: user.id,
      sessionId,
    });

    const session = await focusService.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Focus session not found',
        },
      });
    }

    if (session.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Access denied',
        },
      });
    }

    const response = {
      id: session._id,
      taskId: session.task_worked_on,
      startedAt: session.session_start.toISOString(),
      endedAt: session.session_end?.toISOString(),
      durationMinutes: session.duration_minutes,
      focusQuality: session.focus_quality,
      sessionType: session.session_type,
      environment: session.environment,
      backgroundNoise: session.background_noise,
      interruptions: session.interruptions,
      notes: session.notes,
      energyLevelBefore: session.energy_level_before,
      energyLevelAfter: session.energy_level_after,
      satisfactionRating: session.satisfaction_rating,
      streakCount: session.streak_count,
      createdAt: session.created_at.toISOString(),
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
 * POST /api/focus/session/:sessionId/quick-complete
 * Quick complete a session with default values
 */
router.post('/session/:sessionId/quick-complete',
  validation.sessionId,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { sessionId } = req.params;
    const { actualDurationMinutes = 25, focusQuality = 'MEDIUM' } = req.body as any;

    logger.info('Quick completing focus session', {
      userId: user.id,
      sessionId,
      actualDurationMinutes,
      focusQuality,
    });

    const result = await focusService.endFocusSession(sessionId, user.id, {
      actualDurationMinutes,
      focusQuality,
      distractionsCount: 0,
      notes: 'Quick completed session',
    });

    const response: FocusSessionResponse = {
      sessionId: result.sessionId,
      startedAt: '', // Would need to fetch from session
      plannedDurationMinutes: 0, // Would need to fetch from session
      endedAt: result.endedAt.toISOString(),
      actualDurationMinutes,
      focusQuality,
      streakCount: result.streakCount,
      weeklyTotalMinutes: result.weeklyTotalMinutes,
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
 * GET /api/focus/summary
 * Get a summary of focus data for dashboard
 */
router.get('/summary',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Fetching focus summary', { userId: user.id });

    // Get current week stats
    const weekStats = await focusService.getFocusStats(user.id, 'WEEK');

    // Get active session
    const activeSession = await focusService.getActiveSession(user.id);

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaySessions = await focusService.getFocusSessions(
      user.id,
      { page: 1, limit: 100 },
      today,
      tomorrow
    );

    const todayTotalMinutes = todaySessions.data.reduce(
      (sum, session) => sum + session.duration_minutes,
      0
    );

    const summary = {
      currentSession: activeSession ? {
        sessionId: activeSession.sessionId,
        startedAt: activeSession.startedAt.toISOString(),
        durationMinutes: activeSession.durationMinutes,
        taskId: activeSession.taskId,
        focusMode: activeSession.focusMode,
      } : null,
      weeklyStats: {
        totalMinutes: weekStats.total_focus_minutes,
        totalSessions: weekStats.total_sessions_count,
        currentStreak: weekStats.current_streak,
        averageQuality: weekStats.average_focus_quality,
      },
      todayStats: {
        totalMinutes: todayTotalMinutes,
        sessionCount: todaySessions.data.length,
        completedSessions: todaySessions.data.filter(s => s.session_end).length,
      },
      recentSessions: todaySessions.data.slice(0, 5).map(session => ({
        id: session._id,
        startedAt: session.session_start.toISOString(),
        durationMinutes: session.duration_minutes,
        focusQuality: session.focus_quality,
        taskId: session.task_worked_on,
      })),
    };

    res.json({
      success: true,
      data: summary,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

export default router;