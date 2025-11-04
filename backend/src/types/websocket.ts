import { Socket } from 'socket.io';

// WebSocket Event Types
export enum SocketEvent {
  // Connection events
  CONNECT = 'connection',
  DISCONNECT = 'disconnect',
  ERROR = 'error',

  // Chat events
  CHAT_JOIN = 'chat:join',
  CHAT_LEAVE = 'chat:leave',
  CHAT_MESSAGE_SEND = 'message:send',
  CHAT_MESSAGE_RECEIVED = 'message:received',
  CHAT_TYPING_START = 'typing:start',
  CHAT_TYPING_STOP = 'typing:stop',
  CHAT_TYPING_INDICATOR = 'typing:indicator',

  // Focus timer events
  FOCUS_JOIN = 'focus:join',
  FOCUS_LEAVE = 'focus:leave',
  FOCUS_TIMER_START = 'timer:start',
  FOCUS_TIMER_PAUSE = 'timer:pause',
  FOCUS_TIMER_RESUME = 'timer:resume',
  FOCUS_TIMER_STOP = 'timer:stop',
  FOCUS_TIMER_TICK = 'timer:tick',
  FOCUS_TIMER_COMPLETE = 'timer:complete',
  FOCUS_SESSION_END = 'session:end',

  // User status events
  USER_ONLINE = 'user:online',
  USER_OFFLINE = 'user:offline',
  USER_STATUS_UPDATE = 'user:status',

  // System events
  SYSTEM_NOTIFICATION = 'system:notification',
  SYSTEM_MAINTENANCE = 'system:maintenance',
  SYSTEM_SHUTDOWN = 'system:shutdown',
}

// WebSocket Namespaces
export enum SocketNamespace {
  CHAT = '/chat',
  FOCUS = '/focus',
  USER = '/user',
  ADMIN = '/admin',
}

// Socket Data Types
export interface SocketData {
  userId?: string;
  sessionId?: string;
  token?: string;
  isAuthenticated: boolean;
  joinedRooms: string[];
  userRole?: string;
  permissions: string[];
}

// Chat Event Payloads
export interface ChatJoinPayload {
  userId: string;
  sessionId: string;
}

export interface ChatMessageSendPayload {
  content: string;
  sessionId: string;
  metadata?: {
    source?: string;
    clientTimestamp?: number;
  };
}

export interface ChatMessageReceivedPayload {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sessionId: string;
  metadata?: {
    model?: string;
    tokens?: number;
    processingTime?: number;
  };
  context?: {
    tasksConsidered: string[];
    focusStatsUsed: boolean;
    userId: string;
  };
}

export interface TypingIndicatorPayload {
  userId: string;
  isTyping: boolean;
  sessionId: string;
}

// Focus Timer Event Payloads
export interface FocusTimerStartPayload {
  taskId?: string;
  durationMinutes: number;
  focusMode: 'POMODORO' | 'FREE_FORM';
  scheduledStart?: Date;
}

export interface FocusTimerTickPayload {
  sessionId: string;
  remainingSeconds: number;
  elapsedSeconds: number;
  isPaused: boolean;
  taskId?: string;
}

export interface FocusTimerCompletePayload {
  sessionId: string;
  message: string;
  actualDurationMinutes: number;
  canStartBreak: boolean;
  breakDurationMinutes?: number;
}

export interface FocusSessionEndPayload {
  sessionId: string;
  actualDurationMinutes: number;
  focusQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  distractionsCount: number;
  notes?: string;
  energyLevelBefore?: number;
  energyLevelAfter?: number;
  satisfactionRating?: number;
  environment?: string;
  backgroundNoise?: string;
}

// User Status Event Payloads
export interface UserOnlinePayload {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: string;
  currentActivity?: string;
}

export interface UserStatusUpdatePayload {
  status: 'online' | 'away' | 'busy' | 'offline';
  currentActivity?: string;
  focusSessionId?: string;
}

// System Event Payloads
export interface SystemNotificationPayload {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actions?: Array<{
    label: string;
    action: string;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
  persistent?: boolean;
  targetUsers?: string[];
}

export interface SystemMaintenancePayload {
  scheduledAt: string;
  estimatedDuration: number;
  message: string;
  affectsFeatures: string[];
}

// Socket Management Types
export interface SocketManager {
  addSocket(socket: Socket): void;
  removeSocket(socketId: string): void;
  getSocket(socketId: string): Socket | undefined;
  getSocketsByUserId(userId: string): Socket[];
  getSocketsByRoom(room: string): Socket[];
  joinRoom(socket: Socket, room: string): void;
  leaveRoom(socket: Socket, room: string): void;
  broadcastToRoom(room: string, event: string, data: any): void;
  broadcastToUser(userId: string, event: string, data: any): void;
  getConnectedUsers(): string[];
  getUserCount(): number;
  getRoomCount(room: string): number;
}

// Socket Handler Types
export interface SocketHandler {
  handleConnection(socket: Socket): Promise<void>;
  handleDisconnection(socket: Socket, reason: string): Promise<void>;
  handleError(socket: Socket, error: Error): void;
}

export interface ChatSocketHandler extends SocketHandler {
  handleMessageSend(socket: Socket, payload: ChatMessageSendPayload): Promise<void>;
  handleTypingStart(socket: Socket, payload: { sessionId: string }): void;
  handleTypingStop(socket: Socket, payload: { sessionId: string }): void;
  handleJoinChat(socket: Socket, payload: ChatJoinPayload): void;
  handleLeaveChat(socket: Socket, payload: { sessionId: string }): void;
}

export interface FocusSocketHandler extends SocketHandler {
  handleTimerStart(socket: Socket, payload: FocusTimerStartPayload): Promise<void>;
  handleTimerPause(socket: Socket, payload: { sessionId: string }): Promise<void>;
  handleTimerResume(socket: Socket, payload: { sessionId: string }): Promise<void>;
  handleTimerStop(socket: Socket, payload: { sessionId: string }): Promise<void>;
  handleSessionEnd(socket: Socket, payload: FocusSessionEndPayload): Promise<void>;
}

// Socket Middleware Types
export interface SocketMiddleware {
  (socket: Socket, next: (err?: any) => void): void;
}

export interface AuthenticatedSocket extends Socket {
  data: SocketData;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    permissions: string[];
  };
}

// Rate Limiting for WebSocket
export interface SocketRateLimiter {
  isAllowed(socketId: string, event: string, limit: number, windowMs: number): Promise<boolean>;
  getRemainingRequests(socketId: string, event: string): number;
  getResetTime(socketId: string, event: string): number;
}

// Socket Configuration
export interface SocketConfig {
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  pingTimeout: number;
  pingInterval: number;
  maxHttpBufferSize: number;
  transports: string[];
  allowEIO3: boolean;
}

// Socket Metrics
export interface SocketMetrics {
  totalConnections: number;
  activeConnections: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  averageResponseTime: number;
  connectionsByNamespace: Record<string, number>;
  topActiveUsers: Array<{
    userId: string;
    connectionTime: number;
    messagesSent: number;
  }>;
}