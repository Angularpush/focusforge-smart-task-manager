import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';

// Types
export interface ChatMessage {
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
  };
}

export interface TypingIndicator {
  userId?: string;
  isTyping: boolean;
  displayName?: string;
  sessionId: string;
}

interface ChatState {
  // State
  socket: Socket | null;
  isConnected: boolean;
  messages: ChatMessage[];
  currentSessionId: string | null;
  isTyping: boolean;
  typingUsers: Set<string>;
  isLoading: boolean;
  error: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (content: string) => Promise<void>;
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: () => void;
  startTyping: () => void;
  stopTyping: () => void;
  setTypingIndicator: (indicator: TypingIndicator) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  setCurrentSession: (sessionId: string) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

// WebSocket URL
const WEBSOCKET_URL = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:3001';

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      // State
      socket: null,
      isConnected: false,
      messages: [],
      currentSessionId: null,
      isTyping: false,
      typingUsers: new Set(),
      isLoading: false,
      error: null,

      // Actions
      connect: () => {
        if (get().socket?.connected) {
          return; // Already connected
        }

        set({ isLoading: true, error: null });

        try {
          const token = localStorage.getItem('focusforge_token');
          if (!token) {
            throw new Error('No authentication token found');
          }

          const socket = io(WEBSOCKET_URL, {
            auth: {
              token,
            },
            transports: ['websocket', 'polling'],
          });

          // Connection event
          socket.on('connect', () => {
            console.log('Connected to chat server');
            set({
              isConnected: true,
              isLoading: false,
            });
          });

          // Disconnection event
          socket.on('disconnect', (reason) => {
            console.log('Disconnected from chat server:', reason);
            set({
              isConnected: false,
              socket: null,
            });
          });

          // Chat message received
          socket.on('message:received', (data: ChatMessage) => {
            console.log('Received chat message:', data);
            get().addMessage(data);
            get().setTypingIndicator({
              isTyping: false,
              sessionId: data.sessionId,
            });
          });

          // Typing indicator
          socket.on('typing:indicator', (data: TypingIndicator) => {
            get().setTypingIndicator(data);
          });

          // Session events
          socket.on('user_joined_session', (data) => {
            console.log('User joined session:', data);
          });

          socket.on('user_left_session', (data) => {
            console.log('User left session:', data);
          });

          // Connected event with initial data
          socket.on('connected', (data) => {
            console.log('Chat connection established:', data);
          });

          // Error handling
          socket.on('connect_error', (error) => {
            console.error('Chat connection error:', error);
            set({
              error: 'Failed to connect to chat service',
              isLoading: false,
            });
          });

          socket.on('error', (error) => {
            console.error('Chat socket error:', error);
            set({
              error: 'Chat service error',
            });
          });

          set({ socket });
        } catch (error) {
          console.error('Failed to connect to chat service:', error);
          set({
            error: error instanceof Error ? error.message : 'Connection failed',
            isLoading: false,
          });
        }
      },

      disconnect: () => {
        const { socket } = get();
        if (socket) {
          socket.disconnect();
          set({
            socket: null,
            isConnected: false,
            messages: [],
            currentSessionId: null,
            typingUsers: new Set(),
          });
        }
      },

      sendMessage: async (content: string) => {
        const { socket, currentSessionId, isTyping } = get();

        if (!socket || !socket.connected) {
          throw new Error('Not connected to chat service');
        }

        if (!currentSessionId) {
          throw new Error('No active chat session');
        }

        if (!content.trim()) {
          throw new Error('Message cannot be empty');
        }

        try {
          // Send typing indicator first
          socket.emit('message:send', {
            content: content.trim(),
            sessionId: currentSessionId,
            metadata: {
              clientTimestamp: Date.now(),
            },
          });

          // Set local typing state
          set({ isTyping: true });
          setTimeout(() => set({ isTyping: false }), 30000); // Reset after 30 seconds

        } catch (error) {
          console.error('Failed to send message:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to send message',
            isTyping: false,
          });
          throw error;
        }
      },

      joinSession: async (sessionId: string) => {
        const { socket } = get();

        if (!socket || !socket.connected) {
          throw new Error('Not connected to chat service');
        }

        try {
          socket.emit('chat:join', { sessionId });

          // Wait for history
          socket.once('chat_history', (data: { sessionId: string; messages: ChatMessage[] }) => {
            if (data.sessionId === sessionId) {
              set({
                messages: data.messages,
                currentSessionId: sessionId,
              });
            }
          });

          set({ currentSessionId: sessionId });
        } catch (error) {
          console.error('Failed to join session:', error);
          throw error;
        }
      },

      leaveSession: () => {
        const { socket, currentSessionId } = get();

        if (socket && socket.connected && currentSessionId) {
          socket.emit('chat:leave', { sessionId: currentSessionId });
          set({ currentSessionId: null });
        }
      },

      startTyping: () => {
        const { socket, currentSessionId } = get();

        if (socket && socket.connected && currentSessionId) {
          socket.emit('typing:start', { sessionId: currentSessionId });
        }
      },

      stopTyping: () => {
        const { socket, currentSessionId } = get();

        if (socket && socket.connected && currentSessionId) {
          socket.emit('typing:stop', { sessionId: currentSessionId });
        }
      },

      setTypingIndicator: (indicator: TypingIndicator) => {
        const { typingUsers } = get();

        if (indicator.isTyping && indicator.displayName) {
          typingUsers.add(indicator.displayName);
        } else if (!indicator.isTyping && indicator.displayName) {
          typingUsers.delete(indicator.displayName);
        }

        set({ typingUsers: new Set(typingUsers) });
      },

      addMessage: (message: ChatMessage) => {
        const { messages } = get();
        set({ messages: [...messages, message] });
      },

      setMessages: (messages: ChatMessage[]) => {
        set({ messages });
      },

      clearMessages: () => {
        set({ messages: [] });
      },

      setCurrentSession: (sessionId: string) => {
        set({ currentSessionId: sessionId });
      },

      clearError: () => {
        set({ error: null });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },
    }),
    {
      name: 'chat-store',
    }
  )
);

// Hook for auto-connection
export const useAutoConnect = () => {
  const { isConnected, connect, disconnect } = useChatStore();

  React.useEffect(() => {
    // Auto-connect when component mounts
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { isConnected };
};

// Utility functions
export const formatMessageTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 60000) { // Less than 1 minute
    return 'Just now';
  } else if (diffMs < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diffMs / 60000);
    return `${minutes}m ago`;
  } else if (diffMs < 86400000) { // Less than 1 day
    const hours = Math.floor(diffMs / 3600000);
    return `${hours}h ago`;
  } else {
    return date.toLocaleDateString();
  }
};

export const isSameDay = (timestamp1: string, timestamp2: string) => {
  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);
  return date1.toDateString() === date2.toDateString();
};