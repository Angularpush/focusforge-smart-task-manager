import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { QueryClient, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
export interface Task {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  deadline?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
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
      priority?: string;
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

interface TaskFilters {
  status?: string;
  subject?: string;
  sortBy?: 'deadline' | 'priority' | 'created' | 'ai_score';
  sortOrder?: 'asc' | 'desc';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface TaskState {
  // State
  filters: TaskFilters;
  selectedTask: Task | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setFilters: (filters: TaskFilters) => void;
  setSelectedTask: (task: Task | null) => void;
  clearFilters: () => void;
  clearError: () => void;
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
export const useTasks = (filters: TaskFilters = {}) => {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.status) params.append('status', filters.status);
      if (filters.subject) params.append('subject', filters.subject);
      if (filters.sortBy) params.append('sortBy', filters.sortBy);
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
      if (filters.search) params.append('search', filters.search);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.limit) params.append('limit', filters.limit.toString());

      const response = await apiRequest(`/api/tasks?${params}`);
      return response.data;
    },
    staleTime: 1000 * 30, // 30 seconds
  });
};

export const useTask = (taskId: string) => {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const response = await apiRequest(`/api/tasks/${taskId}`);
      return response.data;
    },
    enabled: !!taskId,
    staleTime: 1000 * 60, // 1 minute
  });
};

export const useCreateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskData: {
      naturalLanguageInput?: string;
      title?: string;
      description?: string;
      subject?: string;
      deadline?: string;
      priority?: Task['priority'];
      estimatedDurationMinutes?: number;
    }) => {
      const response = await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData),
      });

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      console.error('Failed to create task:', error);
    },
  });
};

export const useUpdateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, updates }: {
      taskId: string;
      updates: Partial<Task>;
    }) => {
      const response = await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.setQueryData(['task', variables.taskId], data);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      console.error('Failed to update task:', error);
    },
  });
};

export const useDeleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      console.error('Failed to delete task:', error);
    },
  });
};

export const useCompleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest(`/api/tasks/${taskId}/complete`, {
        method: 'POST',
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.setQueryData(['task', variables.taskId], data);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      console.error('Failed to complete task:', error);
    },
  });
};

export const useTaskStats = () => {
  return useQuery({
    queryKey: ['taskStats'],
    queryFn: async () => {
      const response = await apiRequest('/api/tasks/stats');
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useBatchTaskOperation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (batchData: {
      taskIds: string[];
      operation: 'complete' | 'delete' | 'update';
      data?: any;
    }) => {
      const response = await apiRequest('/api/tasks/batch', {
        method: 'POST',
        body: JSON.stringify(batchData),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      console.error('Batch operation failed:', error);
    },
  });
};

// Zustand store
export const useTaskStore = create<TaskState>()(
  devtools(
    (set, get) => ({
      // State
      filters: {
        status: '',
        subject: '',
        sortBy: 'created',
        sortOrder: 'desc',
        search: '',
      },
      selectedTask: null,
      isLoading: false,
      error: null,

      // Actions
      setFilters: (filters) => {
        set({ filters: { ...get().filters, ...filters } });
      },

      setSelectedTask: (task) => {
        set({ selectedTask: task });
      },

      clearFilters: () => {
        set({
          filters: {
            status: '',
            subject: '',
            sortBy: 'created',
            sortOrder: 'desc',
            search: '',
          },
        });
      },

      clearError: () => {
        set({ error: null });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },
    }),
    {
      name: 'task-store',
    }
  )
);

// Helper functions
export const getPriorityColor = (priority: Task['priority']) => {
  switch (priority) {
    case 'URGENT':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'HIGH':
      return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'MEDIUM':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'LOW':
      return 'text-gray-600 bg-gray-50 border-gray-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

export const getStatusColor = (status: Task['status']) => {
  switch (status) {
    case 'COMPLETED':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'IN_PROGRESS':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'CANCELLED':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'PENDING':
      return 'text-gray-600 bg-gray-50 border-gray-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

export const formatDeadline = (deadline: string) => {
  const date = new Date(deadline);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: 'Overdue', className: 'text-red-600 font-medium' };
  } else if (diffDays === 0) {
    return { text: 'Today', className: 'text-orange-600 font-medium' };
  } else if (diffDays === 1) {
    return { text: 'Tomorrow', className: 'text-blue-600 font-medium' };
  } else if (diffDays <= 7) {
    return { text: `${diffDays} days`, className: 'text-gray-600 font-medium' };
  } else {
    return { text: date.toLocaleDateString(), className: 'text-gray-600 font-medium' };
  }
};

export const getDurationText = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes} min`;
  } else if (minutes < 120) {
    return '1 hour';
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
};