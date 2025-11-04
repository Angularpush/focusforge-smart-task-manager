import { ObjectId } from 'mongodb';
import { getMongoConnection } from '../config/database';
import { redisCache, RedisPubSub } from '../config/redis';
import {
  ChatMessage,
  CreateChatMessageInput,
  PaginatedResponse,
  PaginationParams
} from '../types/database';
import { logger } from '../utils/logger';
import { AppError } from '../types';

export class ChatService {
  private get chatCollection() {
    return getMongoConnection().collection('chat_messages');
  }

  private redisPubSub: RedisPubSub;

  constructor() {
    this.redisPubSub = new RedisPubSub();
  }

  async initialize(): Promise<void> {
    await this.redisPubSub.connect();
  }

  async saveMessage(messageData: CreateChatMessageInput): Promise<ChatMessage> {
    try {
      logger.info('Saving chat message', {
        userId: messageData.user_id,
        role: messageData.role,
        sessionId: messageData.session_id,
      });

      const now = new Date();
      const message: Omit<ChatMessage, '_id'> = {
        user_id: messageData.user_id,
        role: messageData.role,
        content: messageData.content,
        timestamp: now,
        session_id: messageData.session_id,
        embedded_context: messageData.embedded_context || {
          included_tasks: [],
          included_focus_stats: {},
        },
        metadata: messageData.metadata || {
          source: 'chat_window',
        },
      };

      const result = await this.chatCollection.insertOne(message as any);
      const savedMessage = await this.getMessageById(result.insertedId.toString());

      if (!savedMessage) {
        throw new AppError('Failed to retrieve saved message', 500, 'MESSAGE_SAVE_FAILED');
      }

      // Publish message for real-time delivery
      await this.publishChatEvent('message_saved', {
        messageId: savedMessage._id,
        userId: messageData.user_id,
        sessionId: messageData.session_id,
        role: messageData.role,
      });

      logger.debug('Chat message saved successfully', {
        messageId: savedMessage._id,
        userId: messageData.user_id,
      });

      return savedMessage;

    } catch (error) {
      logger.error('Failed to save chat message', {
        userId: messageData.user_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getMessageHistory(
    userId: string,
    sessionId?: string,
    pagination: PaginationParams = {}
  ): Promise<PaginatedResponse<ChatMessage>> {
    try {
      const {
        page = 1,
        limit = 50,
        offset = ((page - 1) * limit)
      } = pagination;

      // Build query
      const query: any = { user_id: userId };

      if (sessionId) {
        query.session_id = sessionId;
      }

      const [messages, total] = await Promise.all([
        this.chatCollection
          .find(query)
          .sort({ timestamp: -1 })
          .skip(offset)
          .limit(limit)
          .toArray(),
        this.chatCollection.countDocuments(query),
      ]);

      // Reverse to get chronological order (newest first was retrieved)
      const chronologicalMessages = (messages as ChatMessage[]).reverse();

      const paginatedResponse: PaginatedResponse<ChatMessage> = {
        data: chronologicalMessages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1,
        },
      };

      logger.debug('Retrieved chat history', {
        userId,
        sessionId,
        count: messages.length,
        total,
        page,
      });

      return paginatedResponse;

    } catch (error) {
      logger.error('Failed to get chat history', {
        userId,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getMessageById(messageId: string): Promise<ChatMessage | null> {
    try {
      if (!ObjectId.isValid(messageId)) {
        return null;
      }

      const message = await this.chatCollection.findOne({ _id: new ObjectId(messageId) });
      return message as ChatMessage || null;

    } catch (error) {
      logger.error('Failed to get message by ID', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async createNewSession(userId: string): Promise<string> {
    try {
      const sessionId = new ObjectId().toString();
      const sessionData = {
        sessionId,
        userId,
        createdAt: new Date().toISOString(),
      };

      // Store session info in cache (in production, you might want a dedicated sessions collection)
      await redisCache.set(`chat_session:${sessionId}`, sessionData, 86400); // 24 hours

      logger.info('Created new chat session', {
        userId,
        sessionId,
      });

      return sessionId;

    } catch (error) {
      logger.error('Failed to create chat session', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getUserContext(userId: string): Promise<any> {
    try {
      // This would typically gather user's tasks, focus stats, and other context
      // For now, we'll return a basic structure
      const context = {
        userId,
        timestamp: new Date().toISOString(),
        // In a full implementation, you'd fetch:
        // - Recent tasks
        // - Current focus session
        // - Upcoming deadlines
        // - Study patterns
        // - Learning history
      };

      return context;

    } catch (error) {
      logger.error('Failed to get user context', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async processUserMessage(
    userId: string,
    sessionId: string,
    content: string
  ): Promise<void> {
    try {
      logger.info('Processing user message', {
        userId,
        sessionId,
        content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      });

      // Save user message
      await this.saveMessage({
        user_id: userId,
        role: 'user',
        content,
        session_id: sessionId,
        embedded_context: {
          included_tasks: [],
          included_focus_stats: {},
        },
        metadata: {
          source: 'chat_window',
        },
      });

      // Get user context for AI processing
      const userContext = await this.getUserContext(userId);

      // Publish message to AI service via Redis
      await this.publishChatEvent('user_message', {
        userId,
        sessionId,
        content,
        context: userContext,
        timestamp: new Date().toISOString(),
      });

      logger.debug('User message published for AI processing', {
        userId,
        sessionId,
      });

    } catch (error) {
      logger.error('Failed to process user message', {
        userId,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async handleAIResponse(responseData: {
    userId: string;
    sessionId: string;
    content: string;
    context?: any;
    metadata?: any;
  }): Promise<void> {
    try {
      logger.info('Handling AI response', {
        userId: responseData.userId,
        sessionId: responseData.sessionId,
        content: responseData.content.substring(0, 100) + (responseData.content.length > 100 ? '...' : ''),
      });

      // Save AI response
      const savedMessage = await this.saveMessage({
        user_id: responseData.userId,
        role: 'assistant',
        content: responseData.content,
        session_id: responseData.sessionId,
        embedded_context: {
          included_tasks: responseData.context?.tasksConsidered || [],
          included_focus_stats: responseData.context?.focusStatsUsed ? {} : {},
        },
        metadata: {
          source: 'ai_assistant',
          model: responseData.metadata?.model,
          tokens: responseData.metadata?.tokens,
          processing_time: responseData.metadata?.processing_time,
        },
      });

      // Publish to user's WebSocket connection
      await this.publishChatEvent('ai_response', {
        messageId: savedMessage._id,
        userId: responseData.userId,
        sessionId: responseData.sessionId,
        content: responseData.content,
        context: responseData.context,
        timestamp: savedMessage.timestamp.toISOString(),
      });

      logger.debug('AI response processed and delivered', {
        userId: responseData.userId,
        sessionId: responseData.sessionId,
        messageId: savedMessage._id,
      });

    } catch (error) {
      logger.error('Failed to handle AI response', {
        userId: responseData.userId,
        sessionId: responseData.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async subscribeToAIResponses(callback: (data: any) => void): Promise<void> {
    try {
      await this.redisPubSub.subscribe('ai_response', callback);
      logger.info('Subscribed to AI responses');
    } catch (error) {
      logger.error('Failed to subscribe to AI responses', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getChatStats(userId: string): Promise<any> {
    try {
      const cacheKey = `chat_stats:${userId}`;

      // Try cache first
      const cached = await redisCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Get basic stats
      const totalMessagesPipeline = [
        { $match: { user_id: userId } },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            userMessages: {
              $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] }
            },
            aiMessages: {
              $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] }
            }
          }
        }
      ];

      const statsResult = await this.chatCollection.aggregate(totalMessagesPipeline).toArray();
      const stats = statsResult[0] || {
        totalMessages: 0,
        userMessages: 0,
        aiMessages: 0,
      };

      // Get recent activity
      const recentMessages = await this.chatCollection
        .find({ user_id: userId })
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray();

      const response = {
        totalMessages: stats.totalMessages,
        userMessages: stats.userMessages,
        aiMessages: stats.aiMessages,
        averageResponseTime: 0, // Would need to calculate from timestamps
        mostActiveHour: 0, // Would need to analyze message timestamps
        recentActivity: recentMessages.map(msg => ({
          id: msg._id,
          role: msg.role,
          timestamp: msg.timestamp,
          preview: msg.content.substring(0, 50),
        })),
      };

      // Cache for 5 minutes
      await redisCache.set(cacheKey, response, 300);

      return response;

    } catch (error) {
      logger.error('Failed to get chat stats', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    try {
      const message = await this.getMessageById(messageId);

      if (!message) {
        throw new AppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
      }

      if (message.user_id !== userId) {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      // Soft delete by marking as deleted (you might want to add a deleted flag)
      await this.chatCollection.updateOne(
        { _id: new ObjectId(messageId) },
        {
          $set: {
            'metadata.deleted': true,
            'metadata.deleted_at': new Date(),
          }
        }
      );

      logger.info('Chat message deleted', {
        userId,
        messageId,
      });

    } catch (error) {
      logger.error('Failed to delete chat message', {
        userId,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Private helper methods

  private async publishChatEvent(event: string, data: any): Promise<void> {
    try {
      const channel = `chat:${data.userId}`;
      const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

      await this.redisPubSub.publish(channel, message);

      logger.debug('Chat event published', { event, channel });

    } catch (error) {
      logger.error('Failed to publish chat event', {
        event,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.redisPubSub.disconnect();
      logger.info('Chat service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup chat service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const chatService = new ChatService();