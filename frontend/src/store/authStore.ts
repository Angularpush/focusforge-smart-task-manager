import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { devtools } from 'zustand/middleware';

// Types
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  academicLevel: 'HIGH_SCHOOL' | 'UNDERGRADUATE' | 'GRADUATE';
  major?: string;
  weeklyStudyGoalHours: number;
  timezone: string;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

interface AuthState {
  // State
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (userData: {
    email: string;
    password: string;
    displayName: string;
    academicLevel: User['academicLevel'];
    major?: string;
    weeklyStudyGoalHours?: number;
    timezone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

// API base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// API helper functions
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

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        // State
        user: null,
        token: localStorage.getItem('focusforge_token'),
        isAuthenticated: false,
        isLoading: false,
        error: null,

        // Actions
        login: async (email: string, password: string) => {
          set({ isLoading: true, error: null });

          try {
            const response = await apiRequest('/api/auth/login', {
              method: 'POST',
              body: JSON.stringify({ email, password }),
            });

            const { user, token } = response.data;

            // Save token to localStorage
            localStorage.setItem('focusforge_token', token);

            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Login failed',
              isLoading: false,
            });
            throw error;
          }
        },

        register: async (userData) => {
          set({ isLoading: true, error: null });

          try {
            const response = await apiRequest('/api/auth/register', {
              method: 'POST',
              body: JSON.stringify(userData),
            });

            const { user, token } = response.data;

            // Save token to localStorage
            localStorage.setItem('focusforge_token', token);

            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Registration failed',
              isLoading: false,
            });
            throw error;
          }
        },

        logout: async () => {
          set({ isLoading: true });

          try {
            if (get().token) {
              await apiRequest('/api/auth/logout', {
                method: 'POST',
              });
            }
          } catch (error) {
            console.error('Logout error:', error);
            // Continue with logout even if API call fails
          } finally {
            // Clear localStorage and state
            localStorage.removeItem('focusforge_token');
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            });
          }
        },

        refreshToken: async () => {
          const { token } = get();
          if (!token) return;

          try {
            const response = await apiRequest('/api/auth/refresh', {
              method: 'POST',
            });

            const { token: newToken } = response.data;

            // Update token in localStorage and state
            localStorage.setItem('focusforge_token', newToken);
            set({ token: newToken });
          } catch (error) {
            console.error('Token refresh failed:', error);
            // If refresh fails, logout user
            await get().logout();
            throw error;
          }
        },

        updateProfile: async (updates) => {
          const { user } = get();
          if (!user) return;

          set({ isLoading: true, error: null });

          try {
            const response = await apiRequest('/api/auth/profile', {
              method: 'PUT',
              body: JSON.stringify(updates),
            });

            const updatedUser = response.data;

            set({
              user: { ...user, ...updatedUser },
              isLoading: false,
              error: null,
            });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Profile update failed',
              isLoading: false,
            });
            throw error;
          }
        },

        clearError: () => {
          set({ error: null });
        },

        setLoading: (isLoading) => {
          set({ isLoading });
        },
      }),
      {
        name: 'auth-store',
        partialize: (state) => ({
          user: state.user,
          token: state.token,
          isAuthenticated: state.isAuthenticated,
        }),
        onRehydrateStorage: (state) => {
          // Re-validate token on rehydrate
          const token = state?.state?.token;
          if (token) {
            state.setState({ token });
          }
        },
      }
    ),
    {
      name: 'auth-store',
    }
  )
);

// Initialize auth state on app load
export const initializeAuth = () => {
  const { token, refreshToken, setLoading } = useAuthStore.getState();

  if (token) {
    setLoading(true);
    // Validate token and fetch user data
    apiRequest('/api/auth/me')
      .then((response) => {
        useAuthStore.setState({
          user: response.data,
          isAuthenticated: true,
          isLoading: false,
        });
      })
      .catch(async (error) => {
        console.error('Token validation failed:', error);
        // Try to refresh token
        try {
          await refreshToken();
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          // Clear invalid token
          localStorage.removeItem('focusforge_token');
          useAuthStore.setState({
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }
};

// Token expiration checker
export const checkTokenExpiration = () => {
  const { token } = useAuthStore.getState();

  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now() / 1000;
    const expirationTime = payload.exp;

    // If token expires within 5 minutes, refresh it
    if (expirationTime - currentTime < 300) {
      useAuthStore.getState().refreshToken();
      return true;
    }

    // If token is expired, logout user
    if (currentTime >= expirationTime) {
      useAuthStore.getState().logout();
      return true;
    }
  } catch (error) {
    console.error('Invalid token format:', error);
    useAuthStore.getState().logout();
    return true;
  }

  return false;
};