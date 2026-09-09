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

export interface Artist {
  id: string;
  name: string;
  website: string;
  joindate: string;
  image: string;
  songCount?: number;
  albums?: Album[];
  topTracks?: Track[];
  relatedArtists?: Artist[];
}

export interface Album {
  id: string;
  name: string;
  releasedate: string;
  artist_id: string;
  artist_name: string;
  image: string;
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
  queue: Track[];
  currentIndex: number;
  playbackHistory: Track[];
  sessionId: number;
  isShuffling: boolean;
  repeatMode: 'none' | 'one' | 'all';
}

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
