import { useEffect, useSyncExternalStore } from 'react';
import { userApi, type SearchHistoryItem } from './userApi';
import { useAuthStore } from '../store/authStore';

/**
 * Recent searches, in one place.
 *
 * This used to live inside SearchBar, which meant every mounted search field
 * kept its own copy and fetched the authenticated history again. Search now has
 * a dedicated page as well as the header field, so the list is held here: one
 * cache, one fetch, and every consumer sees the same items.
 *
 * Guests are stored locally, authenticated users on the account. The storage key
 * is unchanged, so history saved by earlier builds still reads back.
 */
const HISTORY_KEY = 'notify_recent_searches';
const HISTORY_LIMIT = 10;

let items: SearchHistoryItem[] = [];
let loadedFor: boolean | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => items;

const readGuestHistory = (): SearchHistoryItem[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeGuestHistory = (next: SearchHistoryItem[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // A full or blocked storage quota must not break searching.
  }
};

const setItems = (next: SearchHistoryItem[]) => {
  items = next.slice(0, HISTORY_LIMIT);
  emit();
};

/** Fetches once per auth state. Concurrent callers share the same request. */
export function loadSearchHistory(force = false): Promise<void> {
  const isAuthenticated = useAuthStore.getState().isAuthenticated;
  if (!force && loadedFor === isAuthenticated) return inFlight ?? Promise.resolve();
  if (inFlight && !force) return inFlight;

  loadedFor = isAuthenticated;
  inFlight = (async () => {
    const next = isAuthenticated
      ? await userApi.getSearchHistory().catch(() => [])
      : readGuestHistory();
    setItems(next);
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export async function saveSearch(value: string): Promise<void> {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) return;
  // Already the most recent entry: reloading /search?q=... must not reshuffle the list.
  if (items[0]?.query.toLowerCase() === clean.toLowerCase()) return;

  if (useAuthStore.getState().isAuthenticated) {
    await userApi.addSearchHistory(clean).catch(() => {});
    await loadSearchHistory(true);
    return;
  }

  const next = [
    { query: clean, searchedAt: new Date().toISOString() },
    ...readGuestHistory().filter((item) => item.query.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, HISTORY_LIMIT);
  writeGuestHistory(next);
  setItems(next);
}

export async function removeSearch(value: string): Promise<void> {
  if (useAuthStore.getState().isAuthenticated) {
    await userApi.removeSearchHistory(value).catch(() => {});
    await loadSearchHistory(true);
    return;
  }
  const next = readGuestHistory().filter((item) => item.query !== value);
  writeGuestHistory(next);
  setItems(next);
}

export async function clearSearchHistory(): Promise<void> {
  if (useAuthStore.getState().isAuthenticated) await userApi.clearSearchHistory().catch(() => {});
  else localStorage.removeItem(HISTORY_KEY);
  setItems([]);
}

/** Recent searches for the current user, kept in sync across every consumer. */
export function useSearchHistory(): SearchHistoryItem[] {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const history = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void loadSearchHistory();
  }, [isAuthenticated]);

  return history;
}
