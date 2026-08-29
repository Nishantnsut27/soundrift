export class ApiError extends Error {
  public status: number;
  public details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export const API_BASE_URL = (import.meta.env as Record<string, string | undefined>).VITE_API_URL || 'https://notify-music.onrender.com';

import { removeStoredToken } from './tokenStorage';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        return true;
      }
      removeStoredToken();
      window.dispatchEvent(new Event('auth:session-expired'));
      return false;
    } catch {
      removeStoredToken();
      window.dispatchEvent(new Event('auth:session-expired'));
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function fetchJson<T>(
  url: string,
  options?: RequestInit,
  retries = 1,
  delay = 300,
  hasRefreshedToken = false
): Promise<T> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 401 && !hasRefreshedToken && !url.includes('/api/auth/refresh')) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return fetchJson<T>(url, options, retries, delay, true);
        }
      }

      const errorMessage = data?.error || data?.message || `HTTP error status ${response.status}`;

      if (retries > 0 && (response.status === 429 || response.status >= 500)) {
        const method = options?.method?.toUpperCase() || 'GET';
        if (method === 'GET') {
          let retryDelay = delay;
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            if (retryAfter) {
              const parsed = parseInt(retryAfter, 10);
              if (!isNaN(parsed)) retryDelay = parsed * 1000;
            }
          }
          await new Promise((res) => setTimeout(res, retryDelay));
          return fetchJson<T>(url, options, retries - 1, retryDelay > delay ? retryDelay : delay * 2, hasRefreshedToken);
        }
      }

      throw new ApiError(errorMessage, response.status, data);
    }

    return data as T;
  } catch (error) {
    if (options?.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw error;
    }
    if (error instanceof ApiError) {
      throw error;
    }
    const method = options?.method?.toUpperCase() || 'GET';
    if (retries > 0 && method === 'GET') {
      await new Promise((res) => setTimeout(res, delay));
      return fetchJson<T>(url, options, retries - 1, delay * 2, hasRefreshedToken);
    }
    throw new ApiError(error instanceof Error ? error.message : 'Network request failed', 0);
  }
}
