// PostgreSQL database types (Users, Sessions, Subjects)

export interface User {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  academic_level: 'HIGH_SCHOOL' | 'UNDERGRADUATE' | 'GRADUATE';
  major?: string;
  weekly_study_goal_hours: number;
  timezone: string;
  preferences: Record<string, any>;
  is_active: boolean;
  last_login_at?: Date;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  firebase_uid: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  academic_level?: 'HIGH_SCHOOL' | 'UNDERGRADUATE' | 'GRADUATE';
  major?: string;
  weekly_study_goal_hours?: number;
  timezone?: string;
  preferences?: Record<string, any>;
}

export interface UpdateUserInput {
  display_name?: string;
  avatar_url?: string;
  academic_level?: 'HIGH_SCHOOL' | 'UNDERGRADUATE' | 'GRADUATE';
  major?: string;
  weekly_study_goal_hours?: number;
  timezone?: string;
  preferences?: Record<string, any>;
  is_active?: boolean;
  email_verified?: boolean;
}

export interface Session {
  id: string;
  user_id: string;
  session_date: Date;
  session_duration_minutes: number;
  focus_quality: 'LOW' | 'MEDIUM' | 'HIGH';
  distractions_count: number;
  completed_task_id?: string;
  notes?: string;
  session_type: 'POMODORO' | 'FREE_FORM' | 'REVIEW' | 'BREAK';
  interruptions?: string[];
  energy_level_before?: number;
  energy_level_after?: number;
  satisfaction_rating?: number;
  environment?: string;
  background_noise?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionInput {
  user_id: string;
  session_date: Date;
  session_duration_minutes: number;
  focus_quality?: 'LOW' | 'MEDIUM' | 'HIGH';
  distractions_count?: number;
  completed_task_id?: string;
  notes?: string;
  session_type?: 'POMODORO' | 'FREE_FORM' | 'REVIEW' | 'BREAK';
  interruptions?: string[];
  energy_level_before?: number;
  energy_level_after?: number;
  satisfaction_rating?: number;
  environment?: string;
  background_noise?: string;
}

export interface UpdateSessionInput {
  session_duration_minutes?: number;
  focus_quality?: 'LOW' | 'MEDIUM' | 'HIGH';
  distractions_count?: number;
  completed_task_id?: string;
  notes?: string;
  interruptions?: string[];
  energy_level_before?: number;
  energy_level_after?: number;
  satisfaction_rating?: number;
  environment?: string;
  background_noise?: string;
}

export interface Subject {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  color_code: string;
  course_code?: string;
  instructor?: string;
  semester?: string;
  credits?: number;
  difficulty_level: number;
  priority_weight: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSubjectInput {
  user_id: string;
  name: string;
  description?: string;
  color_code?: string;
  course_code?: string;
  instructor?: string;
  semester?: string;
  credits?: number;
  difficulty_level?: number;
  priority_weight?: number;
  is_active?: boolean;
}

export interface UpdateSubjectInput {
  name?: string;
  description?: string;
  color_code?: string;
  course_code?: string;
  instructor?: string;
  semester?: string;
  credits?: number;
  difficulty_level?: number;
  priority_weight?: number;
  is_active?: boolean;
}

// MongoDB document types (Tasks, Chat Messages, Focus Logs, Vector Store)

export interface Task {
  _id: string;
  user_id: string;
  title: string;
  description?: string;
  subject_id?: string;
  deadline?: Date;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  estimated_duration_minutes: number;
  actual_duration_minutes?: number;
  dependencies: string[];
  tags: string[];
  natural_language_input: string;
  parsed_metadata: {
    confidence: number;
    entities: {
      dates?: string[];
      subjects?: string[];
      priorities?: string[];
    };
  };
  ai_suggestions: {
    best_time_to_start?: Date;
    recommended_break_points?: number[];
    estimated_difficulty?: number;
  };
  ai_score: number;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface CreateTaskInput {
  user_id: string;
  title: string;
  description?: string;
  subject_id?: string;
  deadline?: Date;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimated_duration_minutes?: number;
  tags?: string[];
  natural_language_input: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  subject_id?: string;
  deadline?: Date;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  estimated_duration_minutes?: number;
  actual_duration_minutes?: number;
  tags?: string[];
  ai_suggestions?: {
    best_time_to_start?: Date;
    recommended_break_points?: number[];
    estimated_difficulty?: number;
  };
  ai_score?: number;
}

export interface ChatMessage {
  _id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  session_id: string;
  embedded_context: {
    included_tasks: string[];
    included_focus_stats: Record<string, any>;
  };
  metadata: {
    source: string;
    model?: string;
    tokens?: number;
    processing_time?: number;
  };
}

export interface CreateChatMessageInput {
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  session_id: string;
  embedded_context?: {
    included_tasks: string[];
    included_focus_stats: Record<string, any>;
  };
  metadata?: {
    source: string;
    model?: string;
    tokens?: number;
    processing_time?: number;
  };
}

export interface FocusLog {
  _id: string;
  user_id: string;
  session_start: Date;
  session_end?: Date;
  duration_minutes: number;
  focus_quality: 'LOW' | 'MEDIUM' | 'HIGH';
  task_worked_on?: string;
  interruptions: number;
  notes?: string;
  streak_count: number;
  session_type: 'POMODORO' | 'FREE_FORM' | 'REVIEW' | 'BREAK';
  environment?: string;
  background_noise?: string;
  energy_level_before?: number;
  energy_level_after?: number;
  satisfaction_rating?: number;
  created_at: Date;
}

export interface CreateFocusLogInput {
  user_id: string;
  session_start: Date;
  session_end?: Date;
  duration_minutes: number;
  focus_quality: 'LOW' | 'MEDIUM' | 'HIGH';
  task_worked_on?: string;
  interruptions?: number;
  notes?: string;
  session_type?: 'POMODORO' | 'FREE_FORM' | 'REVIEW' | 'BREAK';
  environment?: string;
  background_noise?: string;
  energy_level_before?: number;
  energy_level_after?: number;
  satisfaction_rating?: number;
}

export interface VectorStore {
  _id: string;
  user_id: string;
  content: string;
  embedding: number[];
  metadata: {
    type: string;
    week?: string;
    subject?: string;
    task_id?: string;
    session_id?: string;
  };
  created_at: Date;
}

export interface CreateVectorStoreInput {
  user_id: string;
  content: string;
  embedding: number[];
  metadata: {
    type: string;
    week?: string;
    subject?: string;
    task_id?: string;
    session_id?: string;
  };
}

// Analytics and Statistics types

export interface FocusStats {
  period: 'DAY' | 'WEEK' | 'MONTH';
  total_sessions_count: number;
  total_focus_minutes: number;
  average_session_duration: number;
  current_streak: number;
  longest_streak: number;
  average_focus_quality: 'LOW' | 'MEDIUM' | 'HIGH';
  daily_breakdown: Array<{
    date: string;
    sessionCount: number;
    totalMinutes: number;
    averageQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
}

export interface TaskStats {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  cancelled_tasks: number;
  completion_rate: number;
  average_completion_time: number;
  tasks_by_priority: Record<string, number>;
  tasks_by_subject: Record<string, number>;
  overdue_tasks: number;
}

export interface DashboardData {
  priority_tasks: Array<{
    id: string;
    title: string;
    ai_score: number;
    deadline?: string;
    priority: string;
  }>;
  focus_stats: {
    weekly_total: number;
    current_streak: number;
    average_quality: string;
  };
  completion_rate: number;
  suggested_schedule: {
    today: Array<{
      taskId: string;
      suggestedStartTime: string;
      estimatedDuration: number;
    }>;
  };
}