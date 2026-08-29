import { create } from 'zustand';
import { authApi, type UserProfile } from '../services/authApi';
import { ApiError } from '../services/apiClient';
import { removeStoredToken } from '../services/tokenStorage';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  login: (data: { email: string; password: string; rememberMe?: boolean }) => Promise<boolean>;
  signup: (data: { fullName: string; email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  completeOAuth: () => Promise<{ status: 'success' | 'error' | 'none'; reason?: string }>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(credentials);
      set({
        user: response.user,
        token: null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      import('./playerStore').then(({ usePlayerStore }) => {
        usePlayerStore.getState().syncCloudUserData();
      });
      return true;
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Invalid email or password.';
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
      return false;
    }
  },

  signup: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.register(credentials);
      set({
        user: response.user,
        token: null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      import('./playerStore').then(({ usePlayerStore }) => {
        usePlayerStore.getState().syncCloudUserData();
      });
      return true;
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApi.logout();
    } catch {
    } finally {
      removeStoredToken();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      import('./playerStore').then(({ usePlayerStore }) => {
        const store = usePlayerStore.getState();
        store.clearResults();
        store.clearQueue();
        store.clearRecommendations();
        usePlayerStore.setState({
          query: '',
          isLoading: false,
          error: null,
          currentView: 'search',
          recentlyPlayed: [],
          listeningHistory: [],
          favorites: [],
          playlists: [],
          relatedMusic: null,
        });
        try {
          localStorage.removeItem('playlists');
          localStorage.removeItem('favorites');
        } catch {
        }
        sessionStorage.removeItem('player-playback');
        window.dispatchEvent(new CustomEvent('reset-search-state'));
      });
    }
  },

  checkAuth: async () => {
    try {
      const response = await authApi.getCurrentUser();
      set({
        user: response.user,
        isAuthenticated: true,
        isInitialized: true,
        error: null,
      });
      import('./playerStore').then(({ usePlayerStore }) => {
        usePlayerStore.getState().syncCloudUserData();
      });
      return;
    } catch {
      removeStoredToken();
    }
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isInitialized: true,
    });
  },

  completeOAuth: async () => {
    if (typeof window === 'undefined') return { status: 'none' };
    const params = new URLSearchParams(window.location.search);
    const status = params.get('auth');
    const reason = params.get('reason') || undefined;
    const cleanUrl = () => {
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      window.history.replaceState(null, '', url.toString());
    };

    if (status === 'success') {
      try {
        const response = await authApi.getCurrentUser();
        set({
          user: response.user,
          isAuthenticated: true,
          isInitialized: true,
          error: null,
        });
        cleanUrl();
        import('./playerStore').then(({ usePlayerStore }) => {
          usePlayerStore.getState().syncCloudUserData();
        });
        return { status: 'success' };
      } catch (err) {
        cleanUrl();
        set({ isInitialized: true });
        const message = err instanceof ApiError ? err.message : 'Unable to reach the authentication service.';
        return { status: 'error', reason: message };
      }
    }

    if (status === 'error') {
      cleanUrl();
      set({ isInitialized: true });
      return { status: 'error', reason };
    }

    return { status: 'none' };
  },

  clearError: () => set({ error: null }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('auth:session-expired', () => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
  });
}
