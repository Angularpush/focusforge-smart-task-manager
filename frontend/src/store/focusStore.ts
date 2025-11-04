import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { QueryClient, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
export interface FocusSession {
  id: string;
  taskId?: string;
  startedAt: string;
  endedAt?: string;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  focusQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  sessionType: 'POMODORO' | 'FREE_FORM';
  environment?: string;
  interruptions: number;
  notes?: string;
  satisfactionRating?: number;
  energyLevelBefore?: number;
  energyLevelAfter?: number;
  streakCount: number;
  weeklyTotalMinutes: number;
}

export interface FocusStats {
  period: 'DAY' | 'WEEK' | 'MONTH';
  totalSessionsCount: number;
  totalFocusMinutes: number;
  averageSessionDuration: number;
  currentStreak: number;
  longestStreak: number;
  averageFocusQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  dailyBreakdown: Array<{
    date: string;
    sessionCount: number;
    totalMinutes: number;
    averageQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
}

interface FocusState {
  // State
  activeSession: FocusSession | null;
  isRunning: boolean;
  timeElapsed: number;
  timeTotal: number;
  focusQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  interruptions: number;
  notes: string;
  environment: string;
  energyLevelBefore: number;
  energyLevelAfter: number;
  satisfactionRating: number;
  selectedTaskId: string | null;
  isLoading: boolean;
  error: string | null;

  // Timer state
  timerInterval: NodeJS.Timeout | null;

  // Actions
  startSession: (data: {
    taskId?: string;
    durationMinutes: number;
    focusMode: 'POMODOROR' | 'FREE_FORM';
  }) => Promise<void>;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: (endData?: {
    focusQuality?: 'LOW' | 'MEDIUM' | 'HIGH';
    distractionsCount?: number;
    notes?: string;
    energyLevelBefore?: number;
    energyLevelAfter?: number;
    satisfactionRating?: number;
    environment?: string;
  }) => Promise<void>;
  tick: (deltaSeconds: number) => void;
  reset: () => void;
  setSelectedTask: (taskId: string | null) => void;
  setFocusQuality: (quality: 'LOW' | 'MEDIUM' | 'HIGH') => void;
  setNotes: (notes: string) => void;
  setEnvironment: (environment: string) => void;
  setEnergyLevelBefore: (level: number) => void;
  setEnergyLevelAfter: (level: number) => void;
  setSatisfactionRating: (rating: number) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

// API base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// API helper function
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('focusforge_token');

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Request failed');
  }

  return response.json();
};

// React Query hooks
export const useActiveSession = () => {
  return useQuery({
    queryKey: ['activeFocusSession'],
    queryFn: async () => {
      try {
        const response = await apiRequest('/api/focus/session/active');
        return response.data;
      } catch (error) {
        // Return null if no active session (404 is expected)
        return null;
      }
    },
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 0,
  });
};

export const useFocusSessions = (filters: {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
} = {}) => {
  return useQuery({
    queryKey: ['focusSessions', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.page) params.append('page', filters.page.toString());
      if (filters.limit) params.append('limit', filters.limit.toString());
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await apiRequest(`/api/focus/sessions?${params}`);
      return response.data;
    },
    staleTime: 1000 * 30, // 30 seconds
  });
};

export const useFocusStats = (period: 'DAY' | 'WEEK' | 'MONTH' = 'WEEK') => {
  return useQuery({
    queryKey: ['focusStats', period],
    queryFn: async () => {
      const response = await apiRequest(`/api/focus/stats?period=${period}`);
      return response.data.data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const useStartSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      taskId?: string;
      durationMinutes: number;
      focusMode: 'POMODORO' | 'FREE_FORM';
    }) => {
      const response = await apiRequest('/api/focus/session/start', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activeFocusSession'] });
      queryClient.invalidateQueries({ queryKey: ['focusStats'] });
      queryClient.invalidateQueries({ queryKey: ['focusSummary'] });
    },
    onError: (error) => {
      console.error('Failed to start focus session:', error);
    },
  });
};

export const useEndSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, endData }: {
      sessionId: string;
      endData?: {
        focusQuality?: 'LOW' | 'MEDIUM' | 'HIGH';
        distractionsCount?: number;
        notes?: string;
        energyLevelBefore?: number;
        energyLevelAfter?: number;
        satisfactionRating?: number;
        environment?: string;
      };
    }) => {
      const response = await apiRequest(`/api/focus/session/${sessionId}/end`, {
        method: 'POST',
        body: JSON.stringify({
          actualDurationMinutes: endData?.actualDurationMinutes || 25,
          focusQuality: endData?.focusQuality || 'MEDIUM',
          distractionsCount: endData?.distractionsCount || 0,
          notes: endData?.notes,
          energyLevelBefore: endData?.energyLevelBefore,
          energyLevelAfter: endData?.energyLevelAfter,
          satisfactionRating: endData?.satisfactionRating,
          environment: endData?.environment,
        }),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeFocusSession'] });
      queryClient.invalidateQueries({ queryKey: ['focusStats'] });
      queryClient.invalidateQueries({ queryKey: ['focusSummary'] });
    },
    onError: (error) => {
      console.error('Failed to end focus session:', error);
    },
  });
};

export const useFocusSummary = () => {
  return useQuery({
    queryKey: ['focusSummary'],
    queryFn: async () => {
      const response = await apiRequest('/api/focus/summary');
      return response.data;
    },
    staleTime: 1000 * 60, // 1 minute
  });
};

export const useFocusTrends = (period: 'WEEK' | 'MONTH' | 'QUARTER' = 'WEEK') => {
  return useQuery({
    queryKey: ['focusTrends', period],
    queryFn: async () => {
      const response = await apiRequest(`/api/focus/stats/trends?period=${period}`);
      return response.data.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Zustand store
export const useFocusStore = create<FocusState>()(
  devtools(
    (set, get) => ({
      // State
      activeSession: null,
      isRunning: false,
      timeElapsed: 0,
      timeTotal: 25 * 60, // Default 25 minutes in seconds
      focusQuality: 'MEDIUM',
      interruptions: 0,
      notes: '',
      environment: 'home',
      energyLevelBefore: 5,
      energyLevelAfter: 5,
      satisfactionRating: 3,
      selectedTaskId: null,
      isLoading: false,
      error: null,
      timerInterval: null,

      // Actions
      startSession: async (data) => {
        set({ isLoading: true, error: null });

        try {
          const result = await useStartSession().mutateAsync(data);

          const session = {
            id: result.data.sessionId,
            taskId: data.taskId,
            startedAt: result.data.startedAt,
            plannedDurationMinutes: result.data.plannedDurationMinutes,
            actualDurationMinutes: 0,
            focusQuality: 'MEDIUM',
            sessionType: data.focusMode,
            streakCount: 0,
            weeklyTotalMinutes: 0,
          };

          set({
            activeSession: session,
            isRunning: true,
            timeElapsed: 0,
            timeTotal: data.durationMinutes * 60,
            selectedTaskId: data.taskId,
            isLoading: false,
          });

          // Start timer
          const interval = setInterval(() => {
            get().tick(1);
          }, 1000);

          set({ timerInterval: interval });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to start session',
            isLoading: false,
          });
          throw error;
        }
      },

      pauseSession: () => {
        const { timerInterval, isRunning } = get();

        if (timerInterval && isRunning) {
          clearInterval(timerInterval);
          set({
            timerInterval: null,
            isRunning: false,
          });
        }
      },

      resumeSession: () => {
        const { timerInterval, isRunning } = get();

        if (!timerInterval) {
          const interval = setInterval(() => {
            get().tick(1);
          }, 1000);

          set({
            timerInterval: interval,
            isRunning: true,
          });
        }
      },

      endSession: async (endData) => {
        const { activeSession, timerInterval } = get();

        if (!activeSession) {
          throw new Error('No active session to end');
        }

        try {
          // Clear timer
        if (timerInterval) {
          clearInterval(timerInterval);
          set({ timerInterval: null });
        }

        const result = await useEndSession().mutateAsync({
          sessionId: activeSession.id,
          endData: {
            ...endData,
            actualDurationMinutes: Math.floor(get().timeElapsed / 60),
          },
        });

          // Update session with results
        const updatedSession = {
          ...activeSession,
          endedAt: result.data.endedAt,
          actualDurationMinutes: result.data.actualDurationMinutes,
          focusQuality: endData?.focusQuality || get().focusQuality,
          interruptions: endData?.distractionsCount || get().interruptions,
          notes: endData?.notes || get().notes,
          energyLevelBefore: endData?.energyLevelBefore || get().energyLevelBefore,
          energyLevelAfter: endData?.energyLevelAfter || get().energyLevelAfter,
          satisfactionRating: endData?.satisfactionRating || get().satisfactionRating,
          environment: endData?.environment || get().environment,
          streakCount: result.data.streakCount,
          weeklyTotalMinutes: result.data.weeklyTotalMinutes,
        };

        set({
          activeSession: updatedSession,
          isRunning: false,
          isLoading: false,
        });

        // Reset local state
        setTimeout(() => {
          set({
            activeSession: null,
            timeElapsed: 0,
            timeTotal: 25 * 60,
            focusQuality: 'MEDIUM',
            interruptions: 0,
            notes: '',
            environment: 'home',
            energyLevelBefore: 5,
            energyLevelAfter: 5,
            satisfactionRating: 3,
            selectedTaskId: null,
          });
        }, 2000);
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to end session',
          isLoading: false,
        });
        throw error;
      }
      },

      tick: (deltaSeconds: number) => {
        const { timeElapsed, timeTotal, isRunning } = get();

        if (isRunning && timeElapsed < timeTotal) {
          const newTimeElapsed = Math.min(timeElapsed + deltaSeconds, timeTotal);
          set({ timeElapsed: newTimeElapsed });

          // Check if session should auto-end
          if (newTimeElapsed >= timeTotal) {
            // Auto-end session with default values
            get().endSession({
              focusQuality: 'MEDIUM',
              notes: 'Auto-completed session',
            });
          }
        }
      },

      reset: () => {
        const { timerInterval } = get();

        if (timerInterval) {
          clearInterval(timerInterval);
        }

        set({
          activeSession: null,
          isRunning: false,
          timeElapsed: 0,
          timeTotal: 25 * 60,
          focusQuality: 'MEDIUM',
          interruptions: 0,
          notes: '',
          environment: 'home',
          energyLevelBefore: 5,
          energyLevelAfter: 5,
          satisfactionRating: 3,
          selectedTaskId: null,
          isLoading: false,
          error: null,
          timerInterval: null,
        });
      },

      setSelectedTask: (taskId) => {
        set({ selectedTaskId: taskId });
      },

      setFocusQuality: (quality) => {
        set({ focusQuality: quality });
      },

      setNotes: (notes) => {
        set({ notes });
      },

      setEnvironment: (environment) => {
        set({ environment });
      },

      setEnergyLevelBefore: (level) => {
        set({ energyLevelBefore: level });
      },

      setEnergyLevelAfter: (level) => {
        set({ energyLevelAfter: level });
      },

      setSatisfactionRating: (rating) => {
        set({ satisfactionRating: rating });
      },

      clearError: () => {
        set({ error: null });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },
    }),
    {
      name: 'focus-store',
    }
  )
);

// Helper functions
export const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  } else if (remainingSeconds === 0) {
    return `${minutes}m`;
  } else {
      return `${minutes}m ${remainingSeconds}s`;
  }
};

export const getProgressPercentage = () => {
  const { timeElapsed, timeTotal } = useFocusStore.getState();
  return timeTotal > 0 ? (timeElapsed / timeTotal) * 100 : 0;
};

export const getFocusQualityColor = (quality: 'LOW' | 'MEDIUM' | 'HIGH') => {
  switch (quality) {
    case 'LOW':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'MEDIUM':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'HIGH':
      return 'bg-green-100 text-green-800 border-green-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

export const getEnvironmentIcon = (environment: string) => {
  const icons: { [key: string]: string } = {
    home: '🏠',
    library: '📚',
    cafe: '☕',
    office: '🏢',
    park: '🌳',
    classroom: '🏫',
    study: '📖',
  };
  return icons[environment] || '🏠';
};