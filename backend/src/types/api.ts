// API request/response types

// Authentication
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  academicLevel: 'HIGH_SCHOOL' | 'UNDERGRADUATE' | 'GRADUATE';
  major?: string;
  weeklyStudyGoalHours?: number;
  timezone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    academicLevel: string;
    major?: string;
    weeklyStudyGoalHours: number;
    timezone: string;
  };
  token: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
}

// Task Management
export interface CreateTaskRequest {
  naturalLanguageInput?: string;
  title?: string;
  description?: string;
  subject?: string;
  deadline?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimatedDurationMinutes?: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  subject?: string;
  deadline?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  estimatedDurationMinutes?: number;
}

export interface TaskListRequest {
  status?: string;
  subject?: string;
  sort?: 'deadline' | 'priority' | 'created' | 'ai_score';
  page?: number;
  limit?: number;
}

export interface TaskResponse {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  deadline?: string;
  priority: string;
  status: string;
  estimatedDurationMinutes: number;
  actualDurationMinutes?: number;
  aiScore: number;
  tags: string[];
  naturalLanguageInput: string;
  parsedMetadata?: {
    confidence: number;
    extractedEntities: {
      deadline?: string;
      subject?: string;
    };
  };
  aiSuggestions?: {
    bestTimeToStart?: string;
    recommendedBreakPoints?: number[];
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskParseResult {
  confidence: number;
  extractedEntities: {
    deadline?: string;
    subject?: string;
    priority?: string;
  };
}

// Focus Sessions
export interface StartFocusSessionRequest {
  taskId?: string;
  durationMinutes: number;
  focusMode: 'POMODORO' | 'FREE_FORM';
}

export interface EndFocusSessionRequest {
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

export interface FocusSessionResponse {
  sessionId: string;
  startedAt: string;
  plannedDurationMinutes: number;
  endedAt?: string;
  actualDurationMinutes?: number;
  focusQuality?: string;
  streakCount?: number;
  weeklyTotalMinutes?: number;
}

export interface FocusStatsRequest {
  period?: 'DAY' | 'WEEK' | 'MONTH';
  startDate?: string;
  endDate?: string;
}

export interface FocusStatsResponse {
  period: string;
  totalSessionsCount: number;
  totalFocusMinutes: number;
  averageSessionDuration: number;
  currentStreak: number;
  longestStreak: number;
  averageFocusQuality: string;
  dailyBreakdown: Array<{
    date: string;
    sessionCount: number;
    totalMinutes: number;
    averageQuality: string;
  }>;
}

export interface FocusSessionListRequest {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export interface FocusSessionResponse {
  id: string;
  taskId?: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes: number;
  focusQuality: string;
  sessionType: string;
  environment?: string;
  notes?: string;
  satisfactionRating?: number;
}

// Chat
export interface ChatHistoryRequest {
  limit?: number;
  offset?: number;
  sessionId?: string;
}

export interface ChatHistoryResponse {
  messages: Array<{
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
  }>;
}

export interface NewChatSessionResponse {
  sessionId: string;
  createdAt: string;
}

// WebSocket Events
export interface ChatMessageEvent {
  content: string;
  sessionId: string;
}

export interface ChatMessageResponseEvent {
  id: string;
  role: 'assistant';
  content: string;
  timestamp: string;
  context: {
    tasksConsidered: string[];
    focusStatsUsed: boolean;
  };
}

export interface TypingIndicatorEvent {
  isTyping: boolean;
}

export interface TimerTickEvent {
  sessionId: string;
  remainingSeconds: number;
  elapsedSeconds: number;
}

export interface TimerCompleteEvent {
  sessionId: string;
  message: string;
}

// Dashboard and Analytics
export interface DashboardResponse {
  priorityTasks: Array<{
    id: string;
    title: string;
    aiScore: number;
    deadline?: string;
    priority: string;
  }>;
  focusStats: {
    weeklyTotal: number;
    currentStreak: number;
    averageQuality: string;
  };
  completionRate: number;
  suggestedSchedule: {
    today: Array<{
      taskId: string;
      suggestedStartTime: string;
      estimatedDuration: number;
    }>;
  };
}

export interface FocusTrendsRequest {
  period: 'WEEK' | 'MONTH' | 'QUARTER';
}

export interface FocusTrendsResponse {
  data: Array<{
    date: string;
    focusMinutes: number;
    sessionCount: number;
    averageQuality: string;
  }>;
}

// Subjects
export interface CreateSubjectRequest {
  name: string;
  description?: string;
  colorCode?: string;
  courseCode?: string;
  instructor?: string;
  semester?: string;
  credits?: number;
  difficultyLevel?: number;
  priorityWeight?: number;
}

export interface UpdateSubjectRequest {
  name?: string;
  description?: string;
  colorCode?: string;
  courseCode?: string;
  instructor?: string;
  semester?: string;
  credits?: number;
  difficultyLevel?: number;
  priorityWeight?: number;
  isActive?: boolean;
}

export interface SubjectResponse {
  id: string;
  name: string;
  description?: string;
  colorCode: string;
  courseCode?: string;
  instructor?: string;
  semester?: string;
  credits?: number;
  difficultyLevel: number;
  priorityWeight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Health Check
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  dependencies: {
    postgresql: 'connected' | 'disconnected';
    mongodb: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
    ai_service: 'responding' | 'error';
    firebase: 'configured' | 'error';
  };
  version: string;
  timestamp: string;
}

// Error Response
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Rate Limiting Headers
export interface RateLimitHeaders {
  'RateLimit-Limit': string;
  'RateLimit-Remaining': string;
  'RateLimit-Reset': string;
  'Retry-After'?: string;
}