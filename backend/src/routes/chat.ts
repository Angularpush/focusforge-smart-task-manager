import { Router, Response } from 'express';
import { chatService } from '../services/chatService';
import { authenticateToken } from '../middleware/auth';
import { validation, asyncHandler } from '../middleware/validation';
import { rateLimiters } from '../middleware/rateLimiter';
import { apiLogger } from '../middleware/logger';
import {
  ChatHistoryRequest,
  ChatHistoryResponse,
  NewChatSessionResponse,
  AuthenticatedRequest
} from '../types/api';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication to all chat routes
router.use(authenticateToken);

// Apply rate limiting for chat operations
router.use(rateLimiters.chat);

// Apply API logging
router.use(apiLogger('chat'));

/**
 * GET /api/chat/history
 * Get chat history for the authenticated user
 */
router.get('/history',
  validation.pagination,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const {
      limit,
      offset,
      sessionId,
    } = req.query as any;

    logger.info('Fetching chat history', {
      userId: user.id,
      sessionId,
      limit,
      offset,
    });

    const result = await chatService.getMessageHistory(
      user.id,
      sessionId,
      { limit, offset }
    );

    // Transform messages to response format
    const messages = result.data.map(message => ({
      id: message._id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
      sessionId: message.session_id,
      metadata: message.metadata,
    }));

    const response: ChatHistoryResponse = {
      messages,
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
 * POST /api/chat/session/new
 * Create a new chat session
 */
router.post('/session/new',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Creating new chat session', { userId: user.id });

    const sessionId = await chatService.createNewSession(user.id);

    const response: NewChatSessionResponse = {
      sessionId,
      createdAt: new Date().toISOString(),
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
 * GET /api/chat/stats
 * Get chat statistics for the authenticated user
 */
router.get('/stats',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Fetching chat statistics', { userId: user.id });

    const stats = await chatService.getChatStats(user.id);

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
 * POST /api/chat/message
 * Send a chat message (REST fallback for WebSocket)
 */
router.post('/message',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { content, sessionId } = req.body;

    if (!content || !sessionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Content and sessionId are required',
        },
      });
    }

    logger.info('Sending chat message via REST', {
      userId: user.id,
      sessionId,
      contentLength: content.length,
    });

    try {
      // Process the message
      await chatService.processUserMessage(user.id, sessionId, content);

      res.json({
        success: true,
        data: {
          message: 'Message sent successfully',
          sessionId,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
        },
      });

    } catch (error) {
      logger.error('Failed to send chat message via REST', {
        userId: user.id,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'MESSAGE_SEND_FAILED',
          message: 'Failed to send message',
        },
      });
    }
  })
);

/**
 * DELETE /api/chat/message/:messageId
 * Delete a chat message
 */
router.delete('/message/:messageId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { messageId } = req.params;

    logger.info('Deleting chat message', {
      userId: user.id,
      messageId,
    });

    try {
      await chatService.deleteMessage(messageId, user.id);

      res.status(204).send();

    } catch (error: any) {
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'MESSAGE_NOT_FOUND',
            message: 'Message not found',
          },
        });
      }

      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access denied',
          },
        });
      }

      logger.error('Failed to delete chat message', {
        userId: user.id,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'MESSAGE_DELETE_FAILED',
          message: 'Failed to delete message',
        },
      });
    }
  })
);

/**
 * GET /api/chat/active
 * Get active chat sessions for the user
 */
router.get('/active',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Fetching active chat sessions', { userId: user.id });

    // This would typically fetch active sessions from a cache or database
    // For now, we'll return a basic structure
    const activeSessions = []; // TODO: Implement active session tracking

    res.json({
      success: true,
      data: {
        activeSessions,
        count: activeSessions.length,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * POST /api/chat/feedback
 * Submit feedback on AI responses
 */
router.post('/feedback',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { messageId, rating, feedback } = req.body;

    if (!messageId || !rating) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'MessageId and rating are required',
        },
      });
    }

    logger.info('Chat feedback submitted', {
      userId: user.id,
      messageId,
      rating,
    });

    // TODO: Store feedback in database for AI improvement
    // This could go to a separate feedback collection

    res.json({
      success: true,
      data: {
        message: 'Feedback submitted successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
      },
    });
  })
);

/**
 * GET /api/chat/context
 * Get user context for AI chat
 */
router.get('/context',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    logger.info('Fetching user chat context', { userId: user.id });

    try {
      const context = await chatService.getUserContext(user.id);

      res.json({
        success: true,
        data: context,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
        },
      });

    } catch (error) {
      logger.error('Failed to get user context', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'CONTEXT_FETCH_FAILED',
          message: 'Failed to fetch user context',
        },
      });
    }
  })
);

export default router;