import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Track, Playlist, PlaylistTrack, PlayerState, SearchState, RelatedMusic } from '../types/types';
import { STORAGE_KEYS, PLAYER_DEFAULTS } from '../config/constants';
import { userApi } from '../services/userApi';
import { useAuthStore } from './authStore';

interface PlayerStore extends PlayerState {
  playTrack: (track: Track, _queue?: Track[], _index?: number) => void;
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
  shuffleOrder: number[];
  shufflePosition: number;
  volumeBeforeMute: number;
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
  setRecommendations: (tracks: Track[]) => Promise<void>;
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
    ? `pl_${crypto.randomUUID()}`
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
    playbackHistory: [],
    sessionId: 0,
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

    playTrack: (track: Track) => {
      const state = get();

      const newQueue = [track];
      const newIndex = 0;

      const updatedRecentlyPlayed = [track, ...state.recentlyPlayed.filter(t => t.id !== track.id)].slice(0, 30);

      let shuffleOrder: number[] = [];
      let shufflePosition = 0;
      if (state.isShuffling) {
        shuffleOrder = [0];
        shufflePosition = 0;
      }

      set({
        currentTrack: track,
        isPlaying: true,
        queue: newQueue,
        currentIndex: newIndex,
        playbackHistory: [],
        sessionId: state.sessionId + 1,
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

    setRecommendations: async (tracks: Track[]) => {
      const state = get();
      const knownIds = new Set<string>();
      for (const t of state.queue) knownIds.add(String(t.id));
      for (const t of state.playbackHistory) knownIds.add(String(t.id));
      for (const t of state.recentlyPlayed.slice(0, 30)) knownIds.add(String(t.id));

      const newTracks = tracks.filter(t => t && t.audio && !knownIds.has(String(t.id)));
      if (newTracks.length === 0) return;

      let shuffleOrder = state.shuffleOrder;
      const shufflePosition = state.shufflePosition;
      if (state.isShuffling) {
        shuffleOrder = [...state.shuffleOrder];
        for (let i = 0; i < newTracks.length; i++) shuffleOrder.push(state.queue.length + i);
      }

      set({
        recommendations: tracks,
        queue: [...state.queue, ...newTracks],
        shuffleOrder,
        shufflePosition,
      });
    },

    nextTrack: () => {
      const state = get();
      if (!state.currentTrack || state.queue.length === 0) return;

      let nextIndex: number;
      let playNext = true;

      if (state.repeatMode === 'one') {
        nextIndex = state.currentIndex;
      } else if (state.isShuffling && state.shuffleOrder.length > 0) {
        const nextPos = state.shufflePosition + 1;
        if (nextPos >= state.shuffleOrder.length) {
          if (state.repeatMode === 'all') {
            nextIndex = 0;
          } else {
            playNext = false;
            nextIndex = -1;
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
            playNext = false;
            nextIndex = -1;
          }
        }
      }

      if (!playNext || nextIndex < 0 || nextIndex === state.currentIndex) {
        if (!playNext) set({ isPlaying: false });
        return;
      }

      const history = state.currentIndex >= 0
        ? [...state.playbackHistory, state.queue[state.currentIndex]].filter(Boolean) as Track[]
        : state.playbackHistory;

      const nextTrack = state.queue[nextIndex];
      set({
        currentTrack: nextTrack,
        currentIndex: nextIndex,
        playbackHistory: history,
        currentTime: 0,
        duration: nextTrack.duration || 0,
        isPlaying: true
      });
    },

    previousTrack: () => {
      const state = get();
      if (!state.currentTrack) return;

      if (state.playbackHistory.length === 0) return;

      const prevTrack = state.playbackHistory[state.playbackHistory.length - 1];
      const prevIndex = state.queue.findIndex(t => String(t.id) === String(prevTrack.id));
      const newHistory = state.playbackHistory.slice(0, -1);

      set({
        currentTrack: prevTrack,
        currentIndex: prevIndex >= 0 ? prevIndex : state.currentIndex - 1,
        playbackHistory: newHistory,
        currentTime: 0,
        duration: prevTrack.duration || 0,
        isPlaying: true,
      });
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

    toggleShuffle: () => set((state) => {
      if (state.isShuffling) {
        return { isShuffling: false, shuffleOrder: [], shufflePosition: 0 };
      } else {
        let shuffleOrder = Array.from({ length: state.queue.length }, (_, i) => i);
        for (let i = shuffleOrder.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
        }
        const shufflePosition = 0;
        if (state.currentIndex >= 0 && state.currentIndex < state.queue.length) {
          const pos = shuffleOrder.indexOf(state.currentIndex);
          if (pos > 0) {
            shuffleOrder = [...shuffleOrder.slice(pos), ...shuffleOrder.slice(0, pos)];
          }
        }
        return { isShuffling: true, shuffleOrder, shufflePosition };
      }
    }),

    setRepeatMode: (mode: 'none' | 'one' | 'all') => set({ repeatMode: mode }),

    addToQueue: (track: Track) => {
      const state = get();
      if (state.queue.some(t => String(t.id) === String(track.id))) return;

      let shuffleOrder = state.shuffleOrder;
      if (state.isShuffling) shuffleOrder = [...state.shuffleOrder, state.queue.length];

      set({ queue: [...state.queue, track], shuffleOrder });
    },

    removeFromQueue: (index: number) => {
      const state = get();
      const newQueue = state.queue.filter((_, i) => i !== index);

      if (newQueue.length === 0) {
        set({ queue: [], currentIndex: -1, currentTrack: null, isPlaying: false, playbackHistory: [] });
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

    clearQueue: () => set((state) => ({
      queue: [],
      currentIndex: -1,
      currentTrack: null,
      isPlaying: false,
      playbackHistory: [],
      recommendations: [],
      shuffleOrder: [],
      shufflePosition: 0,
      sessionId: state.sessionId + 1,
    })),

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

    createPlaylist: (name: string, initialTracks?: Track[]) => {
      const state = get();
      const uniqueName = getUniquePlaylistName(name, state.playlists);
      const tempId = newId();
      const newPlaylist: Playlist = {
        id: tempId,
        name: uniqueName,
        tracks: initialTracks ? initialTracks.map(t => ({ ...t, addedAt: Date.now() })) : [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const newPlaylists = [...state.playlists, newPlaylist];
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      if (useAuthStore.getState().isAuthenticated) {
        userApi.createPlaylist(uniqueName).then((remote) => {
          if (remote && remote.id) {
            const currentState = get();
            const currentPlaylist = currentState.playlists.find(p => p.id === tempId);
            const updated = currentState.playlists.map((p) => (p.id === tempId ? { ...p, id: remote.id } : p));
            set({ playlists: updated });
            saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, updated);

            const pendingKey = `pending_tracks_${tempId}`;
            const pendingTracks = JSON.parse(localStorage.getItem(pendingKey) || '[]');
            if (pendingTracks.length > 0) {
              pendingTracks.forEach((track: Track) => {
                userApi.addTrackToPlaylist(remote.id, track).catch(() => { });
              });
              localStorage.removeItem(pendingKey);
            }

            if (currentPlaylist && currentPlaylist.tracks.length > 0) {
              currentPlaylist.tracks.forEach(track => {
                userApi.addTrackToPlaylist(remote.id, track).catch(() => { });
              });
            }
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
        const isTempId = playlistId.startsWith('pl_') || playlistId.startsWith('default-playlist-');
        if (isTempId) {
          const pendingKey = `pending_tracks_${playlistId}`;
          const existing = JSON.parse(localStorage.getItem(pendingKey) || '[]');
          existing.push({ ...track, addedAt: Date.now() });
          localStorage.setItem(pendingKey, JSON.stringify(existing));
        } else {
          userApi.addTrackToPlaylist(playlistId, track).catch(() => { });
        }
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
        const isTempId = playlistId.startsWith('pl_') || playlistId.startsWith('default-playlist-');
        if (isTempId) {
          const pendingKey = `pending_tracks_${playlistId}`;
          const pendingTracks: Track[] = JSON.parse(localStorage.getItem(pendingKey) || '[]');
          const remainingPendingTracks = pendingTracks.filter(track => track.id !== trackId);

          if (remainingPendingTracks.length > 0) {
            localStorage.setItem(pendingKey, JSON.stringify(remainingPendingTracks));
          } else {
            localStorage.removeItem(pendingKey);
          }
          return;
        }

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
          userApi.clearFavorites().catch(() => { });
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
      const validTracks = (candidate.tracks as unknown[])
        .filter(isValidTrack)
        .slice(0, 500)
        .map(t => ({ ...t, addedAt: Date.now() })) as PlaylistTrack[];

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
    clearRecommendations: () => set({ recommendations: [] }),
  }))
);
