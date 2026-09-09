export const BACKEND_URL = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_URL || 'https://api.soundrift.tech';
export const API_BASE_URL = `${BACKEND_URL}/api/music`;

export const API_ENDPOINTS = {
  SEARCH: `${API_BASE_URL}/search`,
  TRENDING: `${API_BASE_URL}/trending`,
  CURATED: `${API_BASE_URL}/curated`,
  SONG: (id: string) => `${API_BASE_URL}/song/${encodeURIComponent(id)}`,
  ARTIST: (id: string) => `${API_BASE_URL}/artist/${encodeURIComponent(id)}`,
  ARTIST_SONGS: (id: string) => `${API_BASE_URL}/artist/${encodeURIComponent(id)}/songs`,
  ARTIST_ALBUMS: (id: string) => `${API_BASE_URL}/artist/${encodeURIComponent(id)}/albums`,
  ARTIST_SEARCH: `${API_BASE_URL}/artists/search`,
  ARTIST_RESOLVE: `${API_BASE_URL}/artists/resolve`,
  ALBUM: (id: string) => `${API_BASE_URL}/album/${encodeURIComponent(id)}`,
  PLAYLIST: (id: string) => `${API_BASE_URL}/playlist/${encodeURIComponent(id)}`,
  PLAYLIST_SEARCH: `${API_BASE_URL}/playlists/search`,
  SUGGESTIONS: (id: string) => `${API_BASE_URL}/suggestions/${encodeURIComponent(id)}`,
} as const;

/**
 * The real support inbox. Lived only inside LegalPage before; it is shared now so
 * "Help & Feedback" affordances point somewhere that actually reaches us instead
 * of at a placeholder link.
 */
export const SUPPORT_EMAIL = 'contactsoundrift@gmail.com';

export const STORAGE_KEYS = {
  VOLUME: 'player-volume',
  PLAYLISTS: 'playlists',
  FAVORITES: 'favorites',
  THEME: 'theme',
  PLAYBACK: 'player-playback',
} as const;

export const VIEWS = {
  SEARCH: 'search',
  PLAYLISTS: 'playlists',
  FAVORITES: 'favorites',
  RECENTLY_PLAYED: 'recently-played',
  HISTORY: 'history',
} as const;

export type ViewType = (typeof VIEWS)[keyof typeof VIEWS];

export const PLAYER_DEFAULTS = {
  DEFAULT_VOLUME: 80,
  SEARCH_DEBOUNCE_MS: 500,
  DEFAULT_SEARCH_LIMIT: 20,
  DEFAULT_TRENDING_LIMIT: 25,
} as const;
