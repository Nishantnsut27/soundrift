import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Track, Playlist, PlaylistTrack, PlayerState, SearchState, RelatedMusic } from '../types/types';
import { STORAGE_KEYS, PLAYER_DEFAULTS } from '../config/constants';
import { userApi } from '../services/userApi';
import { useAuthStore } from './authStore';

interface PlayerStore extends PlayerState {
  playTrack: (track: Track, queue?: Track[], index?: number) => void;
  pauseTrack: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  seekTo: (time: number) => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: 'none' | 'one' | 'all') => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setBuffering: (buffering: boolean) => void;
  setPlaybackError: (error: string | null) => void;
}

interface SearchStore extends SearchState {
  setQuery: (query: string) => void;
  setResults: (results: Track[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setTrending: (trending: Track[]) => void;
  clearResults: () => void;
}

interface PlaylistStore {
  playlists: Playlist[];
  favorites: Track[];
  recentlyPlayed: Track[];
  listeningHistory: Track[];
  relatedMusic: RelatedMusic | null;
  recommendations: Track[];
  autoplayEnabled: boolean;

  syncCloudUserData: () => Promise<void>;
  createPlaylist: (name: string) => Playlist;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  addToFavorites: (track: Track) => void;
  removeFromFavorites: (trackId: string) => void;
  clearFavorites: () => void;
  exportPlaylist: (id: string) => string;
  importPlaylist: (data: string) => void;
  setRelatedMusic: (data: RelatedMusic | null) => void;
  setRecommendations: (tracks: Track[]) => void;
  clearRecommendations: () => void;
}

interface UIStore {
  isSidebarOpen: boolean;
  currentView: 'search' | 'playlists' | 'favorites' | 'recently-played' | 'history' | 'recent';
  theme: 'light' | 'dark';

  toggleSidebar: () => void;
  closeSidebar: () => void;
  setCurrentView: (view: UIStore['currentView']) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

type AppStore = PlayerStore & SearchStore & PlaylistStore & UIStore;

const loadFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const saveToLocalStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

const getUniquePlaylistName = (baseName: string, existingPlaylists: Playlist[], excludeId?: string): string => {
  const existingNames = new Set(
    existingPlaylists
      .filter(p => p.id !== excludeId)
      .map(p => p.name.trim())
  );

  const trimmedBase = baseName.trim();
  if (!existingNames.has(trimmedBase)) {
    return trimmedBase;
  }

  let counter = 1;
  while (existingNames.has(`${trimmedBase} (${counter})`)) {
    counter++;
  }

  return `${trimmedBase} (${counter})`;
};

const areTracksIdentical = (tracksA: PlaylistTrack[] | Track[], tracksB: PlaylistTrack[] | Track[]): boolean => {
  if (tracksA.length === 0 || tracksB.length === 0) return false;
  if (tracksA.length !== tracksB.length) return false;
  const idsA = tracksA.map(t => String(t.id)).join(',');
  const idsB = tracksB.map(t => String(t.id)).join(',');
  return idsA === idsB;
};

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `pl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const isValidTrack = (t: unknown): t is Track => {
  if (!t || typeof t !== 'object') return false;
  const c = t as Record<string, unknown>;
  return (typeof c.id === 'string' || typeof c.id === 'number') && typeof c.name === 'string';
};

const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'default-playlist-1',
    name: 'Top Hits',
    tracks: [
      {
        id: 'demo-track-1',
        name: 'Midnight Groove',
        artist_name: 'Chill Lounge',
        artist_id: 'artist-1',
        album_name: 'Lo-Fi Sessions',
        album_id: 'album-1',
        album_image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
        image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
        audio: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
        audiodownload: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
        duration: 145,
        license_ccurl: '',
        musicinfo: { tags: { genres: ['Lofi', 'Chill'], instruments: [], vartags: [] } },
        addedAt: Date.now()
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export const usePlayerStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: loadFromLocalStorage(STORAGE_KEYS.VOLUME, PLAYER_DEFAULTS.DEFAULT_VOLUME),
    isMuted: false,
    volumeBeforeMute: PLAYER_DEFAULTS.DEFAULT_VOLUME,
    queue: [],
    currentIndex: -1,
    isShuffling: false,
    shuffleOrder: [] as number[],
    shufflePosition: 0,
    repeatMode: 'none',

    query: '',
    results: [],
    isLoading: false,
    error: null,
    trending: [],

    playlists: loadFromLocalStorage(STORAGE_KEYS.PLAYLISTS, DEFAULT_PLAYLISTS),
    favorites: loadFromLocalStorage(STORAGE_KEYS.FAVORITES, []),
    recentlyPlayed: [],
    listeningHistory: [],
    relatedMusic: null,
    recommendations: [],
    autoplayEnabled: true,

    isBuffering: false,
    playbackError: null,

    isSidebarOpen: false,
    currentView: 'search',
    theme: loadFromLocalStorage(STORAGE_KEYS.THEME, 'dark'),

    playTrack: (track: Track, queue?: Track[], index?: number) => {
      const state = get();
      let newQueue = queue || (state.queue.length > 0 ? state.queue : [track]);
      let newIndex = index;

      if (newIndex === undefined) {
        newIndex = newQueue.findIndex(t => String(t.id) === String(track.id));
      }
      if (newIndex === undefined || newIndex < 0) {
        newQueue = [...newQueue, track];
        newIndex = newQueue.length - 1;
      }

      const updatedRecentlyPlayed = [track, ...state.recentlyPlayed.filter(t => t.id !== track.id)].slice(0, 30);

      let shuffleOrder: number[] = [];
      let shufflePosition = 0;
      if (state.isShuffling) {
        shuffleOrder = Array.from({ length: newQueue.length }, (_, i) => i);
        for (let i = shuffleOrder.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
        }
        const pos = shuffleOrder.indexOf(newIndex);
        if (pos > 0) {
          shuffleOrder = [...shuffleOrder.slice(pos), ...shuffleOrder.slice(0, pos)];
        }
        shufflePosition = 0;
      }

      set({
        currentTrack: track,
        isPlaying: true,
        queue: newQueue,
        currentIndex: newIndex,
        currentTime: 0,
        duration: track.duration || 0,
        recentlyPlayed: updatedRecentlyPlayed,
        listeningHistory: [track, ...state.listeningHistory].slice(0, 50),
        shuffleOrder,
        shufflePosition,
      });

      if (useAuthStore.getState().isAuthenticated) {
        userApi.addRecentlyPlayed(track).catch(() => { });
        userApi.recordHistory(track).catch(() => { });
      }
    },

    pauseTrack: () => set({ isPlaying: false }),

    nextTrack: () => {
      const state = get();
      if (state.queue.length === 0) return;

      let nextIndex: number;

      if (state.isShuffling && state.shuffleOrder.length === state.queue.length) {
        const nextPos = state.shufflePosition + 1;
        if (nextPos >= state.shuffleOrder.length) {
          if (state.repeatMode === 'all') {
            const newOrder = Array.from({ length: state.queue.length }, (_, i) => i);
            for (let i = newOrder.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
            }
            set({ shuffleOrder: newOrder, shufflePosition: 0 });
            nextIndex = newOrder[0];
          } else {
            set({ isPlaying: false });
            return;
          }
        } else {
          nextIndex = state.shuffleOrder[nextPos];
          set({ shufflePosition: nextPos });
        }
      } else {
        nextIndex = state.currentIndex + 1;
        if (nextIndex >= state.queue.length) {
          if (state.repeatMode === 'all') {
            nextIndex = 0;
          } else {
            set({ isPlaying: false });
            return;
          }
        }
      }

      const nextTrack = state.queue[nextIndex];
      if (nextTrack) {
        set({
          currentTrack: nextTrack,
          currentIndex: nextIndex,
          currentTime: 0,
          duration: nextTrack.duration || 0,
          isPlaying: true
        });
      }
    },

    previousTrack: () => {
      const state = get();
      if (state.queue.length === 0) return;

      let prevIndex = state.currentIndex - 1;

      if (prevIndex < 0) {
        if (state.repeatMode === 'all') {
          prevIndex = state.queue.length - 1;
        } else {
          return;
        }
      }

      const prevTrack = state.queue[prevIndex];
      if (prevTrack) {
        set({
          currentTrack: prevTrack,
          currentIndex: prevIndex,
          currentTime: 0,
          duration: prevTrack.duration || 0,
          isPlaying: true
        });
      }
    },

    setCurrentTime: (time: number) => set({ currentTime: time }),
    setDuration: (duration: number) => set({ duration }),
    setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),

    setVolume: (volume: number) => {
      const clamped = Math.max(0, Math.min(100, volume));
      set({ volume: clamped, isMuted: clamped === 0 });
      saveToLocalStorage(STORAGE_KEYS.VOLUME, clamped);
    },

    toggleMute: () => set((state) => {
      if (state.isMuted) {
        const restored = state.volumeBeforeMute > 0 ? state.volumeBeforeMute : PLAYER_DEFAULTS.DEFAULT_VOLUME;
        return { isMuted: false, volume: restored };
      }
      return { isMuted: true, volumeBeforeMute: state.volume };
    }),
    seekTo: (time: number) => set({ currentTime: time }),

    toggleShuffle: () => set((state) => ({ isShuffling: !state.isShuffling })),

    setRepeatMode: (mode: 'none' | 'one' | 'all') => set({ repeatMode: mode }),

    addToQueue: (track: Track) => {
      const state = get();
      set({ queue: [...state.queue, track] });
    },

    removeFromQueue: (index: number) => {
      const state = get();
      const newQueue = state.queue.filter((_, i) => i !== index);

      if (newQueue.length === 0) {
        set({ queue: [], currentIndex: -1, currentTrack: null, isPlaying: false });
        return;
      }

      let newCurrentIndex = state.currentIndex;

      if (index < state.currentIndex) {
        newCurrentIndex--;
      } else if (index === state.currentIndex) {
        newCurrentIndex = Math.min(newCurrentIndex, newQueue.length - 1);
      }

      set({
        queue: newQueue,
        currentIndex: newCurrentIndex,
        currentTrack: newQueue[newCurrentIndex] || null
      });
    },

    clearQueue: () => set({ queue: [], currentIndex: -1, currentTrack: null, isPlaying: false }),

    setQuery: (query: string) => set({ query }),
    setResults: (results: Track[]) => set({ results }),
    setLoading: (loading: boolean) => set({ isLoading: loading }),
    setError: (error: string | null) => set({ error }),
    setTrending: (trending: Track[]) => set({ trending }),
    clearResults: () => set({ results: [], query: '', error: null }),

    syncCloudUserData: async () => {
      if (!useAuthStore.getState().isAuthenticated) return;
      try {
        const [cloudFavorites, cloudPlaylists, cloudRecentlyPlayed] = await Promise.all([
          userApi.getFavorites().catch(() => null),
          userApi.getPlaylists().catch(() => null),
          userApi.getRecentlyPlayed().catch(() => null),
        ]);
        if (cloudFavorites !== null) {
          set({ favorites: cloudFavorites });
          saveToLocalStorage(STORAGE_KEYS.FAVORITES, cloudFavorites);
        }
        if (cloudPlaylists !== null) {
          set({ playlists: cloudPlaylists });
          saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, cloudPlaylists);
        }
        if (cloudRecentlyPlayed !== null) {
          set({ recentlyPlayed: cloudRecentlyPlayed, listeningHistory: cloudRecentlyPlayed });
        }
      } catch (err) {
        console.error('Failed to sync cloud user data:', err);
      }
    },

    createPlaylist: (name: string) => {
      const state = get();
      const uniqueName = getUniquePlaylistName(name, state.playlists);
      const tempId = newId();
      const newPlaylist: Playlist = {
        id: tempId,
        name: uniqueName,
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const newPlaylists = [...state.playlists, newPlaylist];
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      if (useAuthStore.getState().isAuthenticated) {
        userApi.createPlaylist(uniqueName).then((remote) => {
          if (remote && remote.id) {
            const updated = get().playlists.map((p) => (p.id === tempId ? { ...p, id: remote.id } : p));
            set({ playlists: updated });
            saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, updated);
          }
        }).catch(() => { });
      }

      return newPlaylist;
    },

    deletePlaylist: (id: string) => {
      const state = get();
      const newPlaylists = state.playlists.filter(p => p.id !== id);
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      if (useAuthStore.getState().isAuthenticated) {
        userApi.deletePlaylist(id).catch(() => { });
      }
    },

    renamePlaylist: (id: string, name: string) => {
      const state = get();
      const uniqueName = getUniquePlaylistName(name, state.playlists, id);
      const newPlaylists = state.playlists.map(p =>
        p.id === id ? { ...p, name: uniqueName, updatedAt: Date.now() } : p
      );
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      if (useAuthStore.getState().isAuthenticated) {
        userApi.updatePlaylist(id, { name: uniqueName }).catch(() => { });
      }
    },

    addTrackToPlaylist: (playlistId: string, track: Track) => {
      const state = get();
      const targetPlaylist = state.playlists.find(p => p.id === playlistId);
      if (targetPlaylist && targetPlaylist.tracks.some(t => t.id === track.id)) {
        return;
      }

      const playlistTrack: PlaylistTrack = {
        ...track,
        addedAt: Date.now()
      };

      const newPlaylists = state.playlists.map(p =>
        p.id === playlistId
          ? {
            ...p,
            tracks: [...p.tracks, playlistTrack],
            updatedAt: Date.now()
          }
          : p
      );
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      if (useAuthStore.getState().isAuthenticated) {
        userApi.addTrackToPlaylist(playlistId, track).catch(() => { });
      }
    },

    removeTrackFromPlaylist: (playlistId: string, trackId: string) => {
      const state = get();
      const newPlaylists = state.playlists.map(p =>
        p.id === playlistId
          ? {
            ...p,
            tracks: p.tracks.filter(t => t.id !== trackId),
            updatedAt: Date.now()
          }
          : p
      );
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      if (useAuthStore.getState().isAuthenticated) {
        userApi.removeTrackFromPlaylist(playlistId, trackId).catch(() => { });
      }
    },

    addToFavorites: (track: Track) => {
      const state = get();
      if (!state.favorites.find(t => t.id === track.id)) {
        const newFavorites = [...state.favorites, track];
        set({ favorites: newFavorites });
        saveToLocalStorage(STORAGE_KEYS.FAVORITES, newFavorites);

        if (useAuthStore.getState().isAuthenticated) {
          userApi.addFavorite(track).catch(() => { });
        }
      }
    },

    removeFromFavorites: (trackId: string) => {
      const state = get();
      const newFavorites = state.favorites.filter(t => t.id !== trackId);
      set({ favorites: newFavorites });
      saveToLocalStorage(STORAGE_KEYS.FAVORITES, newFavorites);

      if (useAuthStore.getState().isAuthenticated) {
        userApi.removeFavorite(trackId).catch(() => { });
      }
    },

    clearFavorites: () => {
      set({ favorites: [] });
      saveToLocalStorage(STORAGE_KEYS.FAVORITES, []);
      if (useAuthStore.getState().isAuthenticated) {
        import('../services/userApi').then(({ userApi }) => {
          userApi.removeFavorite('all').catch(() => { });
        });
      }
    },

    exportPlaylist: (id: string) => {
      const state = get();
      const playlist = state.playlists.find(p => p.id === id);
      return playlist ? JSON.stringify(playlist, null, 2) : '';
    },

    importPlaylist: (data: string) => {
      const parsed = JSON.parse(data) as unknown;
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid playlist file.');
      const candidate = parsed as Record<string, unknown>;
      if (typeof candidate.name !== 'string' || !Array.isArray(candidate.tracks)) {
        throw new Error('Invalid playlist file.');
      }
      const validTracks = (candidate.tracks as unknown[]).filter(isValidTrack).slice(0, 500);

      const state = get();

      const hasExactSameTracks = state.playlists.some(p => areTracksIdentical(p.tracks, validTracks));
      if (hasExactSameTracks) {
        throw new Error('Playlist already exists.');
      }

      const uniqueName = getUniquePlaylistName(candidate.name, state.playlists);
      const importedPlaylist: Playlist = {
        id: newId(),
        name: uniqueName,
        tracks: validTracks,
        createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      const newPlaylists = [...state.playlists, importedPlaylist];
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      if (useAuthStore.getState().isAuthenticated) {
        userApi.createPlaylist(uniqueName).then((remote) => {
          if (remote && remote.id) {
            const updated = get().playlists.map((p) =>
              p.id === importedPlaylist.id ? { ...p, id: remote.id } : p
            );
            set({ playlists: updated });
            saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, updated);
            validTracks.forEach(track => {
              userApi.addTrackToPlaylist(remote.id, track).catch(() => { });
            });
          }
        }).catch(() => { });
      }
    },

    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    closeSidebar: () => set({ isSidebarOpen: false }),
    setCurrentView: (view) => set({ currentView: view }),

    setTheme: (theme: 'light' | 'dark') => {
      set({ theme });
      saveToLocalStorage(STORAGE_KEYS.THEME, theme);
    },

    setBuffering: (isBuffering: boolean) => set({ isBuffering }),
    setPlaybackError: (playbackError: string | null) => set({ playbackError }),

    setRelatedMusic: (data: RelatedMusic | null) => set({ relatedMusic: data }),
    setRecommendations: (tracks: Track[]) => set({ recommendations: tracks }),
    clearRecommendations: () => set({ recommendations: [] }),
  }))
);
