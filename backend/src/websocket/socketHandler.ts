import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import cors from 'cors';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import ChatNamespace from './chatNamespace';
import { wsRateLimiter } from '../middleware/rateLimiter';

export class SocketHandler {
  private io: SocketIOServer;
  private chatNamespace: ChatNamespace;

  constructor() {
    this.io = new SocketIOServer();
    this.setupMiddleware();
    this.initializeNamespaces();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // CORS middleware
    this.io.use((socket, next) => {
      const origin = socket.handshake.headers.origin;
      const allowedOrigins = config.CORS_ORIGIN.split(',').map(o => o.trim());

      if (config.NODE_ENV === 'development' || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        next();
      } else {
        next(new Error('Origin not allowed'));
      }
    });

    // Rate limiting middleware
    this.io.use(async (socket, next) => {
      const socketId = socket.id;
      const limit = 100; // 100 events per minute
      const windowMs = 60 * 1000; // 1 minute

      if (!wsRateLimiter.isAllowed(socketId, 'general', limit, windowMs)) {
        return next(new Error('Rate limit exceeded'));
      }

      next();
    });

    logger.info('Socket middleware configured');
  }

  private initializeNamespaces(): void {
    // Initialize chat namespace
    this.chatNamespace = new ChatNamespace(this.io);

    // Initialize other namespaces as needed
    // this.focusNamespace = new FocusNamespace(this.io);
    // this.userNamespace = new UserNamespace(this.io);

    logger.info('Socket namespaces initialized');
  }

  private setupErrorHandling(): void {
    this.io.on('connect_error', (error) => {
      logger.error('Socket connection error', {
        error: error.message,
        stack: error.stack,
      });
    });

    // Handle server errors
    this.io.engine.on('connection_error', (err) => {
      logger.error('Socket engine connection error', {
        error: err.message,
        code: err.code,
        context: err.context,
      });
    });

    logger.info('Socket error handling configured');
  }

  attach(server: any): void {
    this.io.attach(server, {
      cors: {
        origin: config.CORS_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6, // 1 MB
      transports: ['websocket', 'polling'],
      allowEIO3: true,
    });

    logger.info('Socket.IO server attached to HTTP server');
  }

  getIO(): SocketIOServer {
    return this.io;
  }

  getChatNamespace(): ChatNamespace {
    return this.chatNamespace;
  }

  // Broadcasting methods
  broadcast(event: string, data: any): void {
    this.io.emit(event, data);
    logger.debug('Broadcasted event to all clients', { event, data });
  }

  broadcastToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
    logger.debug('Broadcasted event to room', { room, event, data });
  }

  // Statistics
  getStats() {
    return {
      connectedSockets: this.io.engine.clientsCount,
      namespaces: {
        chat: this.chatNamespace.getUserCount(),
        // Add other namespaces as needed
      },
      uptime: process.uptime(),
    };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    logger.info('Shutting down Socket.IO server...');

    // Close all namespaces
    this.chatNamespace.cleanup();

    // Close the server
    this.io.close((err) => {
      if (err) {
        logger.error('Error closing Socket.IO server', { error: err.message });
      } else {
        logger.info('Socket.IO server closed successfully');
      }
    });
  }
}

// Create singleton instance
export const socketHandler = new SocketHandler();

// Export for use in main server file
export default socketHandler;