export interface Track {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  artist_id: string;
  album_name: string;
  album_id: string;
  album_image: string;
  image: string;
  audio: string;
  audiodownload: string;
  license_ccurl: string;
  language?: string;
  provider?: string;
  /** Resolved singer credits — first entry matches artist_id / artist_name. */
  artists?: { id: string; name: string }[];
  musicinfo: {
    tags: {
      genres: string[];
      instruments: string[];
      vartags: string[];
    };
  };
}

/** A search hit for a catalogue playlist. Songs arrive only when one is opened. */
export interface PlaylistSummary {
  id: string;
  name: string;
  image: string;
  songCount?: number;
  language?: string;
  provider?: string;
}

/** A page of results plus the true size of the collection behind it. */
export interface PagedResult<T> {
  total: number;
  items: T[];
}

/** A JioSaavn editorial playlist, distinct from a listener's own `Playlist`. */
export interface CataloguePlaylist {
  id: string;
  name: string;
  tracks: Track[];
  image?: string;
  description?: string;
  provider?: string;
}

export interface Album {
  id: string;
  name: string;
  description?: string;
  year?: number | string;
  releasedate?: string;
  artist_id: string;
  artist_name: string;
  image: string;
  songs?: Track[];
  tracks?: Track[];
  songCount?: number;
  duration?: number;
}

export interface RelatedMusic {
  similarSongs: Track[];
  moreFromArtist: Track[];
  moreFromAlbum: Track[];
}

export interface CuratedSection {
  sectionId: string;
  title: string;
  tracks: Track[];
  totalTracks: number;
  initialVisibleCount: number;
  generatedAt: string;
  updatedAt: string;
}

export interface RecommendationContext {
  trackId: string;
  artistName: string;
  albumName: string;
  genres: string[];
}

export interface JamendoApiResponse<T> {
  headers: {
    status: string;
    code: number;
    error_message: string;
    warnings: string;
    results_fullcount: number;
  };
  results: T[];
}

export interface PlaylistTrack extends Track {
  addedAt: number;
}

/**
 * One occurrence of a track in the queue.
 *
 * A queue is a running order, not a set: the same song may legitimately appear
 * three times, and removing the second occurrence must leave the other two. A
 * track id cannot express that, so each occurrence carries an identity of its
 * own. Extending Track keeps every existing reader typed `Track[]` working.
 */
export interface QueueEntry extends Track {
  queueEntryId: string;
}

/** A play that actually happened, with the real time it happened at. */
export interface HistoryEntry extends Track {
  playedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: PlaylistTrack[];
  createdAt: number;
  updatedAt: number;
}

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isBuffering: boolean;
  playbackError: string | null;
  queue: QueueEntry[];
  currentIndex: number;
  playbackHistory: QueueEntry[];
  sessionId: number;
  isShuffling: boolean;
  repeatMode: 'none' | 'one' | 'all';
  /** Where the current queue came from. See {@link QueueContext}. */
  queueContext: QueueContext;
}

/**
 * What the queue represents, which decides what Next means.
 *
 * Three behaviours, not two:
 *
 * - `single` is one loose track with no list behind it. The suggestion engine
 *   tops it up so playback keeps going.
 * - `album` and `playlist` are finite collections the listener deliberately
 *   opened. Next walks to the end and stops; no suggestions are appended.
 * - `section` is a rendered row or list — Trending, a curated section, search
 *   results. Next walks it in the order shown, and the suggestion engine extends
 *   it once it runs low, so a six-card row does not dead-end.
 *
 * Deliberately transient: it describes the live queue, so it is rebuilt on the
 * next play rather than persisted.
 */
export type QueueContext =
  | { kind: 'single' }
  | { kind: 'album'; id: string; name: string }
  | { kind: 'playlist'; id: string; name: string }
  | { kind: 'section'; id: string; name: string };

export interface SearchState {
  /**
   * Live text in the search field. Shared so that every search input on screen
   * shows the same value and a single search engine can read it. Distinct from
   * `query` on purpose: this changes on every keystroke.
   */
  searchInput: string;
  /** The query the current `results` actually belong to. Set when a search runs. */
  query: string;
  results: Track[];
  isLoading: boolean;
  error: string | null;
  trending: Track[];
}

export interface AppState {
  playlists: Playlist[];
  favorites: Track[];
  player: PlayerState;
  search: SearchState;
  ui: {
    isSidebarOpen: boolean;
    currentView: 'search' | 'playlists' | 'favorites';
    theme: 'light' | 'dark';
  };
}

export interface KeyboardShortcuts {
  ' ': () => void;
  'ArrowLeft': () => void;
  'ArrowRight': () => void;
  'ArrowUp': () => void;
  'ArrowDown': () => void;
}
