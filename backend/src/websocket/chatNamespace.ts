import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { getPostgresPool } from '../config/database';
import { chatService } from '../services/chatService';
import { redisCache } from '../config/redis';
import {
  AuthenticatedSocket,
  ChatMessageSendPayload,
  ChatMessageReceivedPayload,
  TypingIndicatorPayload,
  SocketEvent,
  SocketNamespace
} from '../types/websocket';
import { logger, logWebSocketEvent, logAuthEvent } from '../utils/logger';
import { AppError } from '../types';

export class ChatNamespace {
  private io: SocketIOServer;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private socketSessions: Map<string, string> = new Map(); // socketId -> userId
  private typingUsers: Map<string, Set<string>> = new Map(); // sessionId -> Set of userIds

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupNamespace();
  }

  private setupNamespace(): void {
    const chatNamespace = this.io.of(SocketNamespace.CHAT);

    // Authentication middleware
    chatNamespace.use(async (socket: AuthenticatedSocket, next) => {
      try {
        await this.authenticateSocket(socket);
        next();
      } catch (error) {
        logger.error('Socket authentication failed', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    chatNamespace.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });

    logger.info('Chat namespace initialized');
  }

  private async authenticateSocket(socket: AuthenticatedSocket): Promise<void> {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('No token provided', 401, 'NO_TOKEN');
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, config.JWT_SECRET) as any;

      // Fetch user from database
      const pool = getPostgresPool();
      const userQuery = `
        SELECT id, email, display_name, is_active
        FROM users
        WHERE id = $1 AND is_active = true
      `;

      const result = await pool.query(userQuery, [decoded.userId]);

      if (result.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      const user = result.rows[0];

      // Attach user data to socket
      socket.user = {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: 'user', // Simplified for now
        permissions: [], // Simplified for now
      };

      socket.data = {
        userId: user.id,
        sessionId: null,
        token,
        isAuthenticated: true,
        joinedRooms: [],
        permissions: [],
      };

      logger.debug('Socket authenticated successfully', {
        socketId: socket.id,
        userId: user.id,
        email: user.email,
      });

    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
      }
      throw error;
    }
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.user!.id;

    logger.info('Chat socket connected', {
      socketId: socket.id,
      userId,
      displayName: socket.user!.displayName,
    });

    // Track connected user
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socket.id);
    this.socketSessions.set(socket.id, userId);

    // Join user to their personal room
    const userRoom = `user:${userId}`;
    socket.join(userRoom);
    socket.data.joinedRooms.push(userRoom);

    // Notify other clients that user is online
    this.broadcastUserStatus(userId, 'online');

    // Set up event handlers
    this.setupEventHandlers(socket);

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to chat service',
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    logWebSocketEvent('chat_connected', socket.id, { userId });
  }

  private setupEventHandlers(socket: AuthenticatedSocket): void {
    const userId = socket.user!.id;

    // Join chat session
    socket.on(SocketEvent.CHAT_JOIN, async (data: { sessionId: string }) => {
      try {
        await this.handleJoinChatSession(socket, data.sessionId);
      } catch (error) {
        logger.error('Failed to join chat session', {
          socketId: socket.id,
          userId,
          sessionId: data.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        socket.emit('error', {
          code: 'JOIN_SESSION_FAILED',
          message: 'Failed to join chat session',
        });
      }
    });

    // Leave chat session
    socket.on(SocketEvent.CHAT_LEAVE, async (data: { sessionId: string }) => {
      try {
        await this.handleLeaveChatSession(socket, data.sessionId);
      } catch (error) {
        logger.error('Failed to leave chat session', {
          socketId: socket.id,
          userId,
          sessionId: data.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Send message
    socket.on(SocketEvent.CHAT_MESSAGE_SEND, async (data: ChatMessageSendPayload) => {
      try {
        await this.handleMessageSend(socket, data);
      } catch (error) {
        logger.error('Failed to send message', {
          socketId: socket.id,
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        socket.emit('error', {
          code: 'MESSAGE_SEND_FAILED',
          message: 'Failed to send message',
        });
      }
    });

    // Typing indicators
    socket.on(SocketEvent.CHAT_TYPING_START, (data: { sessionId: string }) => {
      this.handleTypingStart(socket, data.sessionId);
    });

    socket.on(SocketEvent.CHAT_TYPING_STOP, (data: { sessionId: string }) => {
      this.handleTypingStop(socket, data.sessionId);
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId,
        error: error.message,
      });
    });
  }

  private async handleJoinChatSession(socket: AuthenticatedSocket, sessionId: string): Promise<void> {
    const userId = socket.user!.id;
    const sessionRoom = `session:${sessionId}`;

    // Join session room
    socket.join(sessionRoom);
    socket.data.joinedRooms.push(sessionRoom);
    socket.data.sessionId = sessionId;

    // Get recent chat history for this session
    const history = await chatService.getMessageHistory(userId, sessionId, { limit: 20 });

    // Send history to the user
    socket.emit('chat_history', {
      sessionId,
      messages: history.data.map(msg => ({
        id: msg._id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        metadata: msg.metadata,
      })),
    });

    // Notify others in the session that user joined
    socket.to(sessionRoom).emit('user_joined_session', {
      sessionId,
      user: {
        id: userId,
        displayName: socket.user!.displayName,
      },
      timestamp: new Date().toISOString(),
    });

    logWebSocketEvent('chat_session_joined', socket.id, { userId, sessionId });
  }

  private async handleLeaveChatSession(socket: AuthenticatedSocket, sessionId: string): Promise<void> {
    const userId = socket.user!.id;
    const sessionRoom = `session:${sessionId}`;

    // Leave session room
    socket.leave(sessionRoom);
    socket.data.joinedRooms = socket.data.joinedRooms.filter((room: string) => room !== sessionRoom);

    if (socket.data.sessionId === sessionId) {
      socket.data.sessionId = null;
    }

    // Remove from typing users for this session
    const typingUsers = this.typingUsers.get(sessionId);
    if (typingUsers) {
      typingUsers.delete(userId);
      if (typingUsers.size === 0) {
        this.typingUsers.delete(sessionId);
      }
    }

    // Notify others in the session that user left
    socket.to(sessionRoom).emit('user_left_session', {
      sessionId,
      user: {
        id: userId,
        displayName: socket.user!.displayName,
      },
      timestamp: new Date().toISOString(),
    });

    logWebSocketEvent('chat_session_left', socket.id, { userId, sessionId });
  }

  private async handleMessageSend(socket: AuthenticatedSocket, data: ChatMessageSendPayload): Promise<void> {
    const userId = socket.user!.id;
    const sessionId = data.sessionId;

    if (!sessionId) {
      throw new AppError('Session ID is required', 400, 'SESSION_ID_REQUIRED');
    }

    logWebSocketEvent('chat_message_send', socket.id, {
      userId,
      sessionId,
      contentLength: data.content.length,
    });

    // Process the message through chat service
    await chatService.processUserMessage(userId, sessionId, data.content);

    // Show typing indicator while AI processes
    this.broadcastTypingIndicator(sessionId, userId, true);

    // Hide typing indicator after a timeout (in case AI doesn't respond quickly)
    setTimeout(() => {
      this.broadcastTypingIndicator(sessionId, userId, false);
    }, 30000); // 30 seconds
  }

  private handleTypingStart(socket: AuthenticatedSocket, sessionId: string): Promise<void> {
    const userId = socket.user!.id;

    if (!this.typingUsers.has(sessionId)) {
      this.typingUsers.set(sessionId, new Set());
    }
    this.typingUsers.get(sessionId)!.add(userId);

    // Broadcast to all users in the session except the sender
    const sessionRoom = `session:${sessionId}`;
    socket.to(sessionRoom).emit(SocketEvent.CHAT_TYPING_INDICATOR, {
      userId,
      sessionId,
      isTyping: true,
      displayName: socket.user!.displayName,
    } as TypingIndicatorPayload);
  }

  private handleTypingStop(socket: AuthenticatedSocket, sessionId: string): Promise<void> {
    const userId = socket.user!.id;

    const typingUsers = this.typingUsers.get(sessionId);
    if (typingUsers) {
      typingUsers.delete(userId);
      if (typingUsers.size === 0) {
        this.typingUsers.delete(sessionId);
      }
    }

    // Broadcast to all users in the session except the sender
    const sessionRoom = `session:${sessionId}`;
    socket.to(sessionRoom).emit(SocketEvent.CHAT_TYPING_INDICATOR, {
      userId,
      sessionId,
      isTyping: false,
      displayName: socket.user!.displayName,
    } as TypingIndicatorPayload);
  }

  private broadcastTypingIndicator(sessionId: string, userId: string, isTyping: boolean): void {
    const sessionRoom = `session:${sessionId}`;
    const userRoom = `user:${userId}`;

    // Send to all users in the session except the typing user
    this.io.to(sessionRoom).except(userRoom).emit(SocketEvent.CHAT_TYPING_INDICATOR, {
      userId,
      sessionId,
      isTyping,
      displayName: 'AI Assistant', // Since this is for AI responses
    } as TypingIndicatorPayload);
  }

  private handleDisconnection(socket: AuthenticatedSocket, reason: string): void {
    const userId = socket.user!.id;

    logger.info('Chat socket disconnected', {
      socketId: socket.id,
      userId,
      reason,
    });

    // Remove from connected users
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
        // Notify other clients that user is offline
        this.broadcastUserStatus(userId, 'offline');
      }
    }

    // Remove from socket sessions
    this.socketSessions.delete(socket.id);

    // Clean up any session-specific data
    if (socket.data.sessionId) {
      const typingUsers = this.typingUsers.get(socket.data.sessionId);
      if (typingUsers) {
        typingUsers.delete(userId);
        if (typingUsers.size === 0) {
          this.typingUsers.delete(socket.data.sessionId);
        }
      }
    }

    logWebSocketEvent('chat_disconnected', socket.id, { userId, reason });
  }

  private broadcastUserStatus(userId: string, status: 'online' | 'offline'): void {
    // Broadcast to all connected clients (in a real app, you might want to limit this to friends)
    this.io.emit(SocketNamespace.CHAT, SocketEvent.USER_STATUS_UPDATE, {
      userId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  // Public methods for external use

  async sendToUser(userId: string, event: string, data: any): Promise<void> {
    const userRoom = `user:${userId}`;
    this.io.to(userRoom).emit(event, data);

    logger.debug('Sent event to user', { userId, event, data });
  }

  async sendToSession(sessionId: string, event: string, data: any): Promise<void> {
    const sessionRoom = `session:${sessionId}`;
    this.io.to(sessionRoom).emit(event, data);

    logger.debug('Sent event to session', { sessionId, event, data });
  }

  getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  getUserCount(): number {
    return this.connectedUsers.size;
  }

  getSessionCount(sessionId: string): number {
    const sessionRoom = `session:${sessionId}`;
    // Note: Socket.IO doesn't provide a direct way to count room members
    // You would need to track this manually
    return 0; // Placeholder
  }

  // Handle AI responses
  async handleAIResponse(responseData: any): Promise<void> {
    const { userId, sessionId, content, context } = responseData;

    // Stop typing indicator
    this.broadcastTypingIndicator(sessionId, userId, false);

    // Send message to user
    const messagePayload: ChatMessageReceivedPayload = {
      id: new Date().getTime().toString(), // Generate temporary ID
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      sessionId,
      context: {
        tasksConsidered: context?.tasksConsidered || [],
        focusStatsUsed: context?.focusStatsUsed || false,
        userId,
      },
    };

    await this.sendToUser(userId, SocketEvent.CHAT_MESSAGE_RECEIVED, messagePayload);

    logWebSocketEvent('ai_response_delivered', '', {
      userId,
      sessionId,
      contentLength: content.length,
    });
  }

  // Cleanup method
  cleanup(): void {
    this.connectedUsers.clear();
    this.socketSessions.clear();
    this.typingUsers.clear();
    logger.info('Chat namespace cleaned up');
  }
}

export default ChatNamespace;