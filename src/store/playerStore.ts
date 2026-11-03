import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Track,
  Playlist,
  PlaylistTrack,
  PlayerState,
  SearchState,
  RelatedMusic,
  QueueContext,
  QueueEntry,
  HistoryEntry,
} from '../types/types';
import { STORAGE_KEYS, PLAYER_DEFAULTS } from '../config/constants';
import { userApi } from '../services/userApi';
import type { RawHistoryEntry } from '../services/userApi';
import { ApiError } from '../services/apiClient';
import { getLibraryOwner, setLibraryOwner } from '../services/tokenStorage';
import { useAuthStore } from './authStore';
import { useToastStore } from './toastStore';
import { getSkipQueuePosition, stepBackInShuffle } from '../utils/queuePlayback';

/** One loose track: the only shape the suggestion engine is allowed to extend. */
const SINGLE_CONTEXT: QueueContext = { kind: 'single' };

let queueEntryCounter = 0;
const queueInstanceId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Stamps a track with an identity for its position in the queue.
 *
 * A page-specific prefix prevents collisions when reconnecting to a native
 * queue that survived a WebView reload. The counter distinguishes repeats.
 */
function toQueueEntry(track: Track): QueueEntry {
  queueEntryCounter += 1;
  return { ...track, queueEntryId: `${queueInstanceId}:q${queueEntryCounter}` };
}

function toQueueEntries(tracks: Track[]): QueueEntry[] {
  return tracks.map(toQueueEntry);
}

/**
 * Re-maps a shuffle order after the queue array has changed shape.
 *
 * `shuffleOrder` holds queue indices, so any insert, removal or move invalidates
 * it. Rather than reshuffling — which would visibly change what plays next for
 * no reason the listener asked for — the walk is rewritten to point at the same
 * entries in their new positions.
 */
function remapShuffleOrder(
  shuffleOrder: number[],
  previousQueue: QueueEntry[],
  nextQueue: QueueEntry[],
): number[] {
  const positionOf = new Map<string, number>();
  nextQueue.forEach((entry, index) => positionOf.set(entry.queueEntryId, index));

  const remapped: number[] = [];
  for (const index of shuffleOrder) {
    const entry = previousQueue[index];
    if (!entry) continue;
    const position = positionOf.get(entry.queueEntryId);
    if (position !== undefined) remapped.push(position);
  }

  const seen = new Set(remapped);
  nextQueue.forEach((_, index) => {
    if (!seen.has(index)) remapped.push(index);
  });

  return remapped;
}

/**
 * Turns the server's history payload into local entries.
 *
 * `playedAt` crosses the wire as an ISO string because it is a Mongo date, and
 * every reader here wants a millisecond number to group and sort by. Rows whose
 * timestamp will not parse are dropped rather than shown at the epoch, since an
 * invented listening time is worse than a missing one.
 */
function normalizeHistory(entries: RawHistoryEntry[]): HistoryEntry[] {
  const normalized: HistoryEntry[] = [];

  for (const entry of entries) {
    const playedAt = typeof entry.playedAt === 'number'
      ? entry.playedAt
      : Date.parse(entry.playedAt);
    if (Number.isNaN(playedAt)) continue;
    normalized.push({ ...entry, playedAt });
  }

  return normalized;
}

/**
 * A shuffled walk over `length` positions that begins on `startIndex`.
 *
 * Fisher–Yates, then rotated so the track the listener actually clicked plays
 * first instead of being jumped over.
 */
function buildShuffleOrder(length: number, startIndex: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (startIndex >= 0 && startIndex < length) {
    const pos = order.indexOf(startIndex);
    if (pos > 0) return [...order.slice(pos), ...order.slice(0, pos)];
  }
  return order;
}

/**
 * Logs one play of a track that has just started: recently played and listening
 * history locally, and on the server for a signed-in listener. Every action that
 * starts a new track — a click, Next, Previous, auto-advance, a lock-screen skip
 * — goes through here exactly once; resuming, seeking and stream recovery do not.
 */
function recordPlay(
  track: Track,
  state: Pick<PlaylistStore, 'recentlyPlayed' | 'listeningHistory'>,
): Pick<PlaylistStore, 'recentlyPlayed' | 'listeningHistory'> {
  // Queue identity is tab-local; it must not reach saved lists or the server.
  const played: Track & { queueEntryId?: string } = { ...track };
  delete played.queueEntryId;

  if (useAuthStore.getState().isAuthenticated) {
    userApi.addRecentlyPlayed(played).catch(() => { });
    userApi.recordHistory(played).catch(() => { });
  }

  return {
    recentlyPlayed: [played, ...state.recentlyPlayed.filter(t => t.id !== played.id)].slice(0, 30),
    listeningHistory: [{ ...played, playedAt: Date.now() }, ...state.listeningHistory].slice(0, 50),
  };
}

interface PlayerStore extends PlayerState {
  /**
   * Starts playback.
   *
   * Pass `queue` and `index` to play a track *within* a list — an album, a
   * playlist — and `context` to say which. Called with a track alone it plays
   * one loose track, which is what the suggestion engine then tops up.
   */
  playTrack: (track: Track, queue?: Track[], index?: number, context?: QueueContext) => void;
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
  /** Inserts directly after the current track, ahead of everything queued. */
  playNext: (track: Track) => void;
  /** Removes one occurrence, addressed by its queue identity rather than by track id. */
  removeFromQueue: (queueEntryId: string) => void;
  /**
   * Moves the entry at queue index `fromIndex` into the play-order slot of the
   * entry at `toIndex`: in the queue itself, or in the shuffled walk when shuffle is on.
   */
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  /**
   * Empties what is queued up next. The current track keeps playing — clearing a
   * queue is a statement about what comes after, not a stop button.
   */
  clearQueue: () => void;
  /** Tears playback down completely: used by the close button and by logout. */
  stopPlayback: () => void;
  setBuffering: (buffering: boolean) => void;
  setPlaybackError: (error: string | null) => void;
  shuffleOrder: number[];
  shufflePosition: number;
  volumeBeforeMute: number;
  /**
   * Set when the listener empties Up Next, so the suggestion engine does not
   * immediately refill the queue they just cleared. Reset by the next explicit
   * play, which is a fresh statement of intent. Session state, never persisted.
   */
  autoQueueSuppressed: boolean;
}

interface SearchStore extends SearchState {
  setSearchInput: (value: string) => void;
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
  listeningHistory: HistoryEntry[];
  relatedMusic: RelatedMusic | null;
  recommendations: Track[];
  autoplayEnabled: boolean;

  syncCloudUserData: () => Promise<void>;
  /**
   * Forgets the signed-in account's library — in memory and in storage — and
   * orphans every server write or sync still in flight for it.
   */
  clearUserLibrary: () => void;
  createPlaylist: (name: string) => Playlist;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  /** Moves one track within a playlist. The order is the playlist's running order. */
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => void;
  addToFavorites: (track: Track) => void;
  removeFromFavorites: (trackId: string) => void;
  clearFavorites: () => void;
  exportPlaylist: (id: string) => string;
  importPlaylist: (data: string) => void;
  setRelatedMusic: (data: RelatedMusic | null) => void;
  setRecommendations: (tracks: Track[]) => Promise<void>;
  clearRecommendations: () => void;
}

/**
 * Every addressable view. `home` and `search` are deliberately separate so the
 * sidebar can highlight exactly one of them; they were previously both mapped to
 * `search`, which made two nav items look active at the same time.
 */
export type AppView =
  | 'home'
  | 'discover'
  | 'search'
  | 'playlists'
  | 'favorites'
  | 'offline'
  | 'recently-played'
  | 'history'
  | 'recent'
  | 'trending'
  | 'new-releases'
  | 'genres'
  | 'album'
  | 'genre'
  | 'playlist';

interface UIStore {
  isSidebarOpen: boolean;
  currentView: AppView;
  theme: 'light' | 'dark';
  /**
   * The album, genre or playlist whose dedicated page is on screen, or null for
   * all other views. A genre's id is its category key, not a catalogue id.
   */
  detailEntity: { kind: 'album' | 'genre' | 'playlist'; id: string } | null;
  /**
   * Bumped by every navigation request, including one to the view already on screen,
   * so "the listener chose somewhere" is observable even when the view doesn't change.
   */
  viewRequestId: number;
  /** Whether the queue drawer is on screen. Session-only, like the queue itself. */
  isQueueOpen: boolean;

  toggleSidebar: () => void;
  closeSidebar: () => void;
  setCurrentView: (view: AppView) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  openAlbum: (id: string) => void;
  openGenre: (id: string) => void;
  openPlaylist: (id: string) => void;
  toggleQueue: () => void;
  closeQueue: () => void;
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

/**
 * Playlists start empty. Earlier builds seeded a hardcoded demo playlist ("Top
 * Hits" / "Midnight Groove") pointing at Unsplash artwork and a Pixabay audio
 * file. That is not Soundrift catalogue data, so it is no longer created for
 * anyone. Existing localStorage is left exactly as it is — nothing is deleted or
 * migrated here — and guest surfaces simply do not read local playlists, so the
 * legacy seed cannot surface in the guest experience.
 */
const INITIAL_PLAYLISTS: Playlist[] = [];

/**
 * Bumped whenever the signed-in library is wiped (logout, session expiry, a
 * different account signing in). Server work started under an older epoch
 * belongs to that previous account and must never write into the store.
 */
let libraryEpoch = 0;
let syncRun = 0;

const isLocalPlaylistId = (id: string): boolean =>
  id.startsWith('pl_') || id.startsWith('default-playlist-');

/** Local ids of playlists whose server create has not resolved yet. */
const pendingPlaylistCreates = new Set<string>();
/** Server id → the local id it replaced, so both keep using one write chain. */
const playlistChainKeys = new Map<string, string>();
const writeChains = new Map<string, Promise<void>>();

/**
 * Runs the server writes for one key strictly in order, so a slow request can
 * never land after the one that superseded it. Writes still queued when the
 * library is wiped are dropped unstarted.
 */
function enqueueWrite(key: string, write: () => Promise<void>): void {
  const epoch = libraryEpoch;
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous
    .then(() => (epoch === libraryEpoch ? write() : undefined))
    .catch((error) => console.error('Library write failed:', error));
  writeChains.set(key, next);
  void next.finally(() => {
    if (writeChains.get(key) === next) writeChains.delete(key);
  });
}

const playlistChain = (playlistId: string): string =>
  `playlist:${playlistChainKeys.get(playlistId) ?? playlistId}`;

const membershipWrites = new Map<string, { latest: number; confirmed: boolean }>();

/**
 * Follows one membership — a favorite, a song in a playlist — while writes for
 * it are in flight. Only the newest write may roll back, and it restores what
 * the server last acknowledged rather than what the screen showed before it,
 * so a failed add followed by a failed remove cannot leave behind a song the
 * server never had.
 */
function beginMembershipWrite(key: string, target: boolean) {
  const entry = membershipWrites.get(key) ?? { latest: 0, confirmed: !target };
  entry.latest += 1;
  membershipWrites.set(key, entry);
  const op = entry.latest;
  return {
    succeeded: () => { entry.confirmed = target; },
    /** The state to restore, or null when a newer write owns the outcome. */
    restoreTo: (): boolean | null => (op === entry.latest ? entry.confirmed : null),
    settle: () => {
      if (op === entry.latest && membershipWrites.get(key) === entry) membershipWrites.delete(key);
    },
  };
}

function reportLibraryFailure(title: string, error: unknown): void {
  const isClientError = error instanceof ApiError
    && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403;
  useToastStore.getState().addToast({
    type: 'error',
    title,
    message: isClientError ? error.message : 'Your change was undone. Check your connection and try again.',
  });
}

function updateFavorites(update: (favorites: Track[]) => Track[]): void {
  const favorites = update(usePlayerStore.getState().favorites);
  usePlayerStore.setState({ favorites });
  saveToLocalStorage(STORAGE_KEYS.FAVORITES, favorites);
}

function updatePlaylists(update: (playlists: Playlist[]) => Playlist[]): void {
  const playlists = update(usePlayerStore.getState().playlists);
  usePlayerStore.setState({ playlists });
  saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, playlists);
}

function insertAt<T>(items: T[], index: number, item: T): T[] {
  const next = [...items];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

function syncFavorite(track: Track, favorite: boolean, index: number): void {
  const key = String(track.id);
  const write = beginMembershipWrite(`favorite:${key}`, favorite);
  const epoch = libraryEpoch;
  enqueueWrite('favorites', async () => {
    try {
      if (favorite) await userApi.addFavorite(track);
      else await userApi.removeFavorite(key);
      write.succeeded();
    } catch (error) {
      const restore = write.restoreTo();
      if (epoch !== libraryEpoch || restore === null) return;
      updateFavorites((favorites) => {
        const present = favorites.some((t) => String(t.id) === key);
        if (restore && !present) return insertAt(favorites, index, track);
        if (!restore && present) return favorites.filter((t) => String(t.id) !== key);
        return favorites;
      });
      reportLibraryFailure(
        favorite ? `Couldn't add "${track.name}" to favorites` : `Couldn't remove "${track.name}" from favorites`,
        error,
      );
    } finally {
      write.settle();
    }
  });
}

function syncPlaylistTrack(playlistId: string, track: PlaylistTrack, inPlaylist: boolean, index: number): void {
  const key = String(track.id);
  const write = beginMembershipWrite(`${playlistChain(playlistId)}:${key}`, inPlaylist);
  const epoch = libraryEpoch;
  enqueueWrite(playlistChain(playlistId), async () => {
    try {
      if (inPlaylist) await userApi.addTrackToPlaylist(playlistId, track);
      else await userApi.removeTrackFromPlaylist(playlistId, key);
      write.succeeded();
    } catch (error) {
      const restore = write.restoreTo();
      if (epoch !== libraryEpoch || restore === null) return;
      const playlist = usePlayerStore.getState().playlists.find((p) => p.id === playlistId);
      if (!playlist) return;
      const present = playlist.tracks.some((t) => String(t.id) === key);
      if (restore !== present) {
        const tracks = restore
          ? insertAt(playlist.tracks, index, track)
          : playlist.tracks.filter((t) => String(t.id) !== key);
        updatePlaylists((playlists) => playlists.map((p) => (p.id === playlistId ? { ...p, tracks } : p)));
      }
      reportLibraryFailure(
        inPlaylist ? `Couldn't add "${track.name}" to "${playlist.name}"` : `Couldn't remove "${track.name}" from "${playlist.name}"`,
        error,
      );
    } finally {
      write.settle();
    }
  });
}

function syncPlaylistRename(playlistId: string, name: string, previousName: string): void {
  const epoch = libraryEpoch;
  enqueueWrite(playlistChain(playlistId), async () => {
    try {
      await userApi.updatePlaylist(playlistId, { name });
    } catch (error) {
      if (epoch !== libraryEpoch) return;
      updatePlaylists((playlists) => playlists.map((p) =>
        p.id === playlistId && p.name === name ? { ...p, name: previousName } : p
      ));
      reportLibraryFailure(`Couldn't rename "${previousName}"`, error);
    }
  });
}

function syncPlaylistDelete(playlist: Playlist, index: number): void {
  const epoch = libraryEpoch;
  enqueueWrite(playlistChain(playlist.id), async () => {
    try {
      await userApi.deletePlaylist(playlist.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return;
      if (epoch !== libraryEpoch) return;
      updatePlaylists((playlists) =>
        playlists.some((p) => p.id === playlist.id) ? playlists : insertAt(playlists, index, playlist)
      );
      reportLibraryFailure(`Couldn't delete "${playlist.name}"`, error);
    }
  });
}

function syncPlaylistOrder(playlistId: string, tracks: PlaylistTrack[], previous: PlaylistTrack[]): void {
  const epoch = libraryEpoch;
  const order = (list: Track[]) => list.map((t) => String(t.id)).join(',');
  enqueueWrite(playlistChain(playlistId), async () => {
    try {
      await userApi.reorderPlaylistTracks(playlistId, tracks);
    } catch (error) {
      if (epoch !== libraryEpoch) return;
      const playlist = usePlayerStore.getState().playlists.find((p) => p.id === playlistId);
      if (!playlist) return;
      if (order(playlist.tracks) === order(tracks)) {
        updatePlaylists((playlists) => playlists.map((p) => (p.id === playlistId ? { ...p, tracks: previous } : p)));
      }
      reportLibraryFailure(`Couldn't reorder "${playlist.name}"`, error);
    }
  });
}

/**
 * Creates the server copy of a playlist made locally under a temporary id.
 *
 * Until the create resolves the local playlist is the only record: songs,
 * renames, reorders and deletion apply to it alone. When the server id arrives
 * the local state is replayed once, and every later change goes to the server
 * on the same write chain, so none of them can overtake the replay.
 */
function syncNewPlaylist(localId: string, name: string): void {
  const epoch = libraryEpoch;
  pendingPlaylistCreates.add(localId);
  enqueueWrite(playlistChain(localId), async () => {
    let serverId: string;
    try {
      const remote = await userApi.createPlaylist(name);
      if (!remote?.id) throw new Error('The server did not return a playlist id.');
      serverId = remote.id;
    } catch (error) {
      pendingPlaylistCreates.delete(localId);
      if (epoch !== libraryEpoch) return;
      const lost = usePlayerStore.getState().playlists.find((p) => p.id === localId);
      if (!lost) return;
      updatePlaylists((playlists) => playlists.filter((p) => p.id !== localId));
      reportLibraryFailure(`Couldn't create "${lost.name}"`, error);
      return;
    }
    pendingPlaylistCreates.delete(localId);
    if (epoch !== libraryEpoch) return;

    const local = usePlayerStore.getState().playlists.find((p) => p.id === localId);
    if (!local) {
      await userApi.deletePlaylist(serverId).catch(() => { });
      return;
    }

    playlistChainKeys.set(serverId, localId);
    usePlayerStore.setState((state) => ({
      playlists: state.playlists.map((p) => (p.id === localId ? { ...p, id: serverId } : p)),
      detailEntity: state.detailEntity?.kind === 'playlist' && state.detailEntity.id === localId
        ? { kind: 'playlist', id: serverId }
        : state.detailEntity,
      queueContext: state.queueContext.kind === 'playlist' && state.queueContext.id === localId
        ? { ...state.queueContext, id: serverId }
        : state.queueContext,
    }));
    saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, usePlayerStore.getState().playlists);

    if (local.name !== name) {
      try {
        await userApi.updatePlaylist(serverId, { name: local.name });
      } catch (error) {
        if (epoch !== libraryEpoch) return;
        updatePlaylists((playlists) => playlists.map((p) =>
          p.id === serverId && p.name === local.name ? { ...p, name } : p
        ));
        reportLibraryFailure(`Couldn't rename "${name}"`, error);
      }
    }

    const failed = new Set<string>();
    let lastError: unknown;
    for (const track of local.tracks) {
      if (epoch !== libraryEpoch) return;
      try {
        await userApi.addTrackToPlaylist(serverId, track);
      } catch (error) {
        failed.add(String(track.id));
        lastError = error;
      }
    }
    if (failed.size === 0 || epoch !== libraryEpoch) return;
    updatePlaylists((playlists) => playlists.map((p) =>
      p.id === serverId ? { ...p, tracks: p.tracks.filter((t) => !failed.has(String(t.id))) } : p
    ));
    reportLibraryFailure(
      failed.size === 1 ? `Couldn't add a song to "${local.name}"` : `Couldn't add ${failed.size} songs to "${local.name}"`,
      lastError,
    );
  });
}

const savedVolume: number = loadFromLocalStorage(STORAGE_KEYS.VOLUME, PLAYER_DEFAULTS.DEFAULT_VOLUME);

export const usePlayerStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: savedVolume,
    isMuted: savedVolume === 0,
    volumeBeforeMute: savedVolume > 0 ? savedVolume : PLAYER_DEFAULTS.DEFAULT_VOLUME,
    queue: [],
    currentIndex: -1,
    playbackHistory: [],
    sessionId: 0,
    isShuffling: false,
    shuffleOrder: [] as number[],
    shufflePosition: 0,
    repeatMode: 'none',
    queueContext: SINGLE_CONTEXT,
    autoQueueSuppressed: false,

    searchInput: '',
    query: '',
    results: [],
    isLoading: false,
    error: null,
    trending: [],

    playlists: loadFromLocalStorage(STORAGE_KEYS.PLAYLISTS, INITIAL_PLAYLISTS),
    favorites: loadFromLocalStorage(STORAGE_KEYS.FAVORITES, []),
    recentlyPlayed: [],
    listeningHistory: [],
    relatedMusic: null,
    recommendations: [],
    autoplayEnabled: true,

    isBuffering: false,
    playbackError: null,

    isSidebarOpen: false,
    currentView: 'home',
    detailEntity: null,
    viewRequestId: 0,
    isQueueOpen: false,
    theme: loadFromLocalStorage(STORAGE_KEYS.THEME, 'dark'),

    playTrack: (track: Track, queue?: Track[], index?: number, context: QueueContext = SINGLE_CONTEXT) => {
      const state = get();

      /* A list is only a list when one was handed over. A search hit or a card
         on Home arrives alone, stays alone, and gets topped up by the radio. */
      const listed = queue && queue.length > 0 ? queue : [track];
      const requested = typeof index === 'number' ? index : -1;
      const listedIndex = requested >= 0
        && requested < listed.length
        && String(listed[requested]?.id) === String(track.id)
        ? requested
        : listed.findIndex(t => String(t.id) === String(track.id));
      /* Not in the list it came with: play it alone rather than starting the
         list somewhere the listener did not click. */
      const sourceTracks = listedIndex === -1 ? [track] : listed;
      const newIndex = Math.max(0, listedIndex);

      const newQueue = toQueueEntries(sourceTracks);

      const shuffleOrder = state.isShuffling ? buildShuffleOrder(newQueue.length, newIndex) : [];
      const shufflePosition = 0;

      set({
        currentTrack: track,
        isPlaying: true,
        queue: newQueue,
        currentIndex: newIndex,
        queueContext: listedIndex === -1 ? SINGLE_CONTEXT : context,
        autoQueueSuppressed: false,
        playbackHistory: [],
        sessionId: state.sessionId + 1,
        currentTime: 0,
        duration: track.duration || 0,
        ...recordPlay(track, state),
        shuffleOrder,
        shufflePosition,
      });
    },

    pauseTrack: () => set({ isPlaying: false }),

    setRecommendations: async (tracks: Track[]) => {
      const state = get();
      /* An album or a playlist is a finite thing the listener opened on purpose,
         and it ends where it ends. A loose track and a rendered section both
         take radio — the section only once Next has walked it to the end. */
      if (state.queueContext.kind === 'album' || state.queueContext.kind === 'playlist') return;

      const knownIds = new Set<string>();
      for (const t of state.queue) knownIds.add(String(t.id));
      for (const t of state.playbackHistory) knownIds.add(String(t.id));
      for (const t of state.recentlyPlayed.slice(0, 30)) knownIds.add(String(t.id));

      const newTracks = tracks.filter(t => t && t.audio && !knownIds.has(String(t.id)));
      if (newTracks.length === 0) return;

      const newEntries = toQueueEntries(newTracks);

      let shuffleOrder = state.shuffleOrder;
      const shufflePosition = state.shufflePosition;
      if (state.isShuffling) {
        shuffleOrder = [...state.shuffleOrder];
        for (let i = 0; i < newEntries.length; i++) shuffleOrder.push(state.queue.length + i);
      }

      set({
        recommendations: tracks,
        queue: [...state.queue, ...newEntries],
        shuffleOrder,
        shufflePosition,
      });
    },

    nextTrack: () => {
      const state = get();
      if (!state.currentTrack) return;

      /* Repeat-one is not consulted here: the `ended` handler replays in that
         mode itself, so every call that reaches this is a skip or a plain advance. */
      const next = getSkipQueuePosition(state);
      if (!next) {
        // Also a current song that was removed from an otherwise empty queue.
        if (state.queue.length > 0 || state.repeatMode === 'none') set({ isPlaying: false });
        return;
      }
      const nextIndex = next.index;
      if (nextIndex === state.currentIndex) return;

      const history = state.currentIndex >= 0
        ? [...state.playbackHistory, state.queue[state.currentIndex]].filter(Boolean) as QueueEntry[]
        : state.playbackHistory;

      const nextTrack = state.queue[nextIndex];
      set({
        currentTrack: nextTrack,
        currentIndex: nextIndex,
        shufflePosition: next.shufflePosition,
        playbackHistory: history,
        currentTime: 0,
        duration: nextTrack.duration || 0,
        isPlaying: true,
        ...recordPlay(nextTrack, state),
      });
    },

    previousTrack: () => {
      const state = get();
      if (!state.currentTrack) return;

      if (state.playbackHistory.length === 0) return;

      const prevTrack = state.playbackHistory[state.playbackHistory.length - 1];
      /* Matched on queue identity, not track id: the same song can sit in the
         queue more than once, and Previous must return to the occurrence that
         actually played. */
      const prevIndex = state.queue.findIndex(t => t.queueEntryId === prevTrack.queueEntryId);
      const newHistory = state.playbackHistory.slice(0, -1);
      const shuffle = state.isShuffling && state.shuffleOrder.length > 0 && prevIndex >= 0
        ? stepBackInShuffle(state.shuffleOrder, state.shufflePosition, prevIndex)
        : { shuffleOrder: state.shuffleOrder, shufflePosition: state.shufflePosition };

      set({
        currentTrack: prevTrack,
        currentIndex: prevIndex >= 0 ? prevIndex : state.currentIndex - 1,
        playbackHistory: newHistory,
        currentTime: 0,
        duration: prevTrack.duration || 0,
        isPlaying: true,
        ...shuffle,
        ...recordPlay(prevTrack, state),
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

    toggleMute: () => {
      const state = get();
      if (state.isMuted) {
        const restored = state.volumeBeforeMute > 0 ? state.volumeBeforeMute : PLAYER_DEFAULTS.DEFAULT_VOLUME;
        set({ isMuted: false, volume: restored });
        saveToLocalStorage(STORAGE_KEYS.VOLUME, restored);
        return;
      }
      set({ isMuted: true, volumeBeforeMute: state.volume });
    },
    seekTo: (time: number) => set({ currentTime: time }),

    toggleShuffle: () => set((state) => {
      if (state.isShuffling) {
        return { isShuffling: false, shuffleOrder: [], shufflePosition: 0 };
      }
      return {
        isShuffling: true,
        shuffleOrder: buildShuffleOrder(state.queue.length, state.currentIndex),
        shufflePosition: 0,
      };
    }),

    setRepeatMode: (mode: 'none' | 'one' | 'all') => set({ repeatMode: mode }),

    addToQueue: (track: Track) => {
      const state = get();
      const entry = toQueueEntry(track);

      let shuffleOrder = state.shuffleOrder;
      if (state.isShuffling) shuffleOrder = [...state.shuffleOrder, state.queue.length];

      set({ queue: [...state.queue, entry], shuffleOrder });
    },

    playNext: (track: Track) => {
      const state = get();
      const entry = toQueueEntry(track);
      const insertAt = state.currentIndex >= 0 ? state.currentIndex + 1 : 0;

      const newQueue = [...state.queue];
      newQueue.splice(insertAt, 0, entry);

      let shuffleOrder = state.shuffleOrder;
      let shufflePosition = state.shufflePosition;
      if (state.isShuffling && state.shuffleOrder.length > 0) {
        shuffleOrder = state.shuffleOrder.map(i => (i >= insertAt ? i + 1 : i));
        shufflePosition = Math.min(state.shufflePosition, shuffleOrder.length);
        shuffleOrder.splice(shufflePosition + 1, 0, insertAt);
      }

      set({
        queue: newQueue,
        currentIndex: state.currentIndex >= insertAt ? state.currentIndex + 1 : state.currentIndex,
        shuffleOrder,
        shufflePosition,
      });
    },

    removeFromQueue: (queueEntryId: string) => {
      const state = get();
      const index = state.queue.findIndex(entry => entry.queueEntryId === queueEntryId);
      if (index === -1) return;

      const newQueue = state.queue.filter((_, i) => i !== index);
      const shuffleOrder = state.isShuffling
        ? remapShuffleOrder(state.shuffleOrder, state.queue, newQueue)
        : state.shuffleOrder;

      /* Removing the track that is playing takes it out of the running order but
         leaves it playing: the listener asked to drop it from the queue, not to
         be cut off mid-song. The current position then sits just before the
         entry that took its slot, so Next plays that entry instead of skipping
         it, and Up Next in the panel starts there too. */
      const removedCurrent = index === state.currentIndex;

      let currentIndex = state.currentIndex;
      if (index < state.currentIndex) currentIndex -= 1;
      else if (removedCurrent) currentIndex = index - 1;

      let shufflePosition = state.shufflePosition;
      if (state.isShuffling) {
        const removedPosition = state.shuffleOrder.indexOf(index);
        if (removedPosition !== -1 && removedPosition <= state.shufflePosition) shufflePosition -= 1;
        shufflePosition = Math.max(-1, Math.min(shufflePosition, shuffleOrder.length - 1));
      }

      set({
        queue: newQueue,
        currentIndex: newQueue.length === 0 ? -1 : currentIndex,
        shuffleOrder,
        shufflePosition,
      });
    },

    reorderQueue: (fromIndex: number, toIndex: number) => {
      const state = get();
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= state.queue.length) return;
      if (toIndex < 0 || toIndex >= state.queue.length) return;

      /* Shuffle plays in shuffleOrder, not queue order, so that walk is what
         moves; the queue stays put for when shuffle is turned off. */
      if (state.isShuffling && state.shuffleOrder.length > 0) {
        const fromPosition = state.shuffleOrder.indexOf(fromIndex);
        const toPosition = state.shuffleOrder.indexOf(toIndex);
        if (fromPosition === -1 || toPosition === -1) return;
        const shuffleOrder = [...state.shuffleOrder];
        shuffleOrder.splice(fromPosition, 1);
        shuffleOrder.splice(toPosition, 0, fromIndex);
        set({ shuffleOrder });
        return;
      }

      const newQueue = [...state.queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, moved);

      const currentEntryId = state.queue[state.currentIndex]?.queueEntryId;
      const currentIndex = currentEntryId
        ? newQueue.findIndex(entry => entry.queueEntryId === currentEntryId)
        : state.currentIndex;

      set({
        queue: newQueue,
        currentIndex,
        shuffleOrder: state.isShuffling
          ? remapShuffleOrder(state.shuffleOrder, state.queue, newQueue)
          : state.shuffleOrder,
      });
    },

    clearQueue: () => set((state) => {
      const current = state.currentIndex >= 0 ? state.queue[state.currentIndex] : undefined;

      return {
        queue: current ? [current] : [],
        currentIndex: current ? 0 : -1,
        recommendations: [],
        shuffleOrder: state.isShuffling && current ? [0] : [],
        shufflePosition: 0,
        queueContext: SINGLE_CONTEXT,
        /* Bumped so a suggestion request already in flight cannot land and refill
           the queue that was just emptied. The flag stops a fresh one starting. */
        sessionId: state.sessionId + 1,
        autoQueueSuppressed: true,
      };
    }),

    stopPlayback: () => set((state) => ({
      queue: [],
      currentIndex: -1,
      currentTrack: null,
      isPlaying: false,
      playbackHistory: [],
      recommendations: [],
      shuffleOrder: [],
      shufflePosition: 0,
      queueContext: SINGLE_CONTEXT,
      autoQueueSuppressed: false,
      sessionId: state.sessionId + 1,
    })),

    setSearchInput: (value: string) => set({ searchInput: value }),
    setQuery: (query: string) => set({ query }),
    setResults: (results: Track[]) => set({ results }),
    setLoading: (loading: boolean) => set({ isLoading: loading }),
    setError: (error: string | null) => set({ error }),
    setTrending: (trending: Track[]) => set({ trending }),
    clearResults: () => set({
      searchInput: '',
      results: [],
      query: '',
      error: null,
      isLoading: false,
    }),

    syncCloudUserData: async () => {
      const { isAuthenticated, user } = useAuthStore.getState();
      if (!isAuthenticated || !user) return;

      /* A library persisted for another account — or by a build that did not
         record owners — must be neither shown nor kept as this one's fallback. */
      if (getLibraryOwner() !== user.id) {
        get().clearUserLibrary();
        setLibraryOwner(user.id);
      }
      const run = ++syncRun;
      const epoch = libraryEpoch;
      const isStale = () =>
        run !== syncRun || epoch !== libraryEpoch || useAuthStore.getState().user?.id !== user.id;

      try {
        const [cloudFavorites, cloudPlaylists, cloudRecentlyPlayed, cloudHistory] = await Promise.all([
          userApi.getFavorites().catch(() => null),
          userApi.getPlaylists().catch(() => null),
          userApi.getRecentlyPlayed().catch(() => null),
          userApi.getHistory().catch(() => null),
        ]);
        if (isStale()) return;
        if (cloudFavorites !== null) {
          set({ favorites: cloudFavorites });
          saveToLocalStorage(STORAGE_KEYS.FAVORITES, cloudFavorites);
        }
        if (cloudPlaylists !== null) {
          /* A playlist whose create is still in flight is not on the server yet;
             dropping it here would make its create delete it on arrival. */
          const unsynced = get().playlists.filter(p => pendingPlaylistCreates.has(p.id));
          const playlists = [...cloudPlaylists, ...unsynced];
          set({ playlists });
          saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, playlists);
        }
        if (cloudRecentlyPlayed !== null) {
          set({ recentlyPlayed: cloudRecentlyPlayed });
        }
        if (cloudHistory !== null) {
          set({ listeningHistory: normalizeHistory(cloudHistory) });
        }
      } catch (err) {
        console.error('Failed to sync cloud user data:', err);
      }
    },

    clearUserLibrary: () => {
      libraryEpoch += 1;
      pendingPlaylistCreates.clear();
      playlistChainKeys.clear();
      membershipWrites.clear();
      writeChains.clear();
      set({ favorites: [], playlists: [], recentlyPlayed: [], listeningHistory: [] });
      try {
        localStorage.removeItem(STORAGE_KEYS.PLAYLISTS);
        localStorage.removeItem(STORAGE_KEYS.FAVORITES);
        // Left behind by builds that parked songs for unsynced playlists in storage.
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith('pending_tracks_')) localStorage.removeItem(key);
        }
      } catch {
        /* Storage can be blocked; the in-memory library above is already cleared. */
      }
      setLibraryOwner(null);
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
        syncNewPlaylist(tempId, uniqueName);
      }

      return newPlaylist;
    },

    deletePlaylist: (id: string) => {
      const state = get();
      const index = state.playlists.findIndex(p => p.id === id);
      if (index === -1) return;
      const deleted = state.playlists[index];
      const newPlaylists = state.playlists.filter(p => p.id !== id);
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      // A local id is deleted by its own pending create once the server id arrives.
      if (useAuthStore.getState().isAuthenticated && !isLocalPlaylistId(id)) {
        syncPlaylistDelete(deleted, index);
      }
    },

    renamePlaylist: (id: string, name: string) => {
      const state = get();
      const previous = state.playlists.find(p => p.id === id);
      const uniqueName = getUniquePlaylistName(name, state.playlists, id);
      const newPlaylists = state.playlists.map(p =>
        p.id === id ? { ...p, name: uniqueName, updatedAt: Date.now() } : p
      );
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      if (
        useAuthStore.getState().isAuthenticated
        && previous
        && previous.name !== uniqueName
        && !isLocalPlaylistId(id)
      ) {
        syncPlaylistRename(id, uniqueName, previous.name);
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

      // A local id's songs are replayed by its pending create.
      if (useAuthStore.getState().isAuthenticated && targetPlaylist && !isLocalPlaylistId(playlistId)) {
        syncPlaylistTrack(playlistId, playlistTrack, true, targetPlaylist.tracks.length);
      }
    },

    removeTrackFromPlaylist: (playlistId: string, trackId: string) => {
      const state = get();
      const playlist = state.playlists.find(p => p.id === playlistId);
      const index = playlist ? playlist.tracks.findIndex(t => t.id === trackId) : -1;
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

      if (useAuthStore.getState().isAuthenticated && playlist && index !== -1 && !isLocalPlaylistId(playlistId)) {
        syncPlaylistTrack(playlistId, playlist.tracks[index], false, index);
      }
    },

    reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => {
      const state = get();
      const playlist = state.playlists.find(p => p.id === playlistId);
      if (!playlist) return;
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= playlist.tracks.length) return;
      if (toIndex < 0 || toIndex >= playlist.tracks.length) return;

      const tracks = [...playlist.tracks];
      const [moved] = tracks.splice(fromIndex, 1);
      tracks.splice(toIndex, 0, moved);

      const newPlaylists = state.playlists.map(p =>
        p.id === playlistId ? { ...p, tracks, updatedAt: Date.now() } : p
      );
      set({ playlists: newPlaylists });
      saveToLocalStorage(STORAGE_KEYS.PLAYLISTS, newPlaylists);

      /* A playlist still under a local id has no server copy to reorder; its
         pending create replays the songs in whatever order they have by then. */
      if (useAuthStore.getState().isAuthenticated && !isLocalPlaylistId(playlistId)) {
        syncPlaylistOrder(playlistId, tracks, playlist.tracks);
      }
    },

    addToFavorites: (track: Track) => {
      const state = get();
      if (!state.favorites.some(t => String(t.id) === String(track.id))) {
        const newFavorites = [...state.favorites, track];
        set({ favorites: newFavorites });
        saveToLocalStorage(STORAGE_KEYS.FAVORITES, newFavorites);

        if (useAuthStore.getState().isAuthenticated) {
          syncFavorite(track, true, state.favorites.length);
        }
      }
    },

    removeFromFavorites: (trackId: string) => {
      const state = get();
      const index = state.favorites.findIndex(t => String(t.id) === String(trackId));
      if (index === -1) return;
      const newFavorites = state.favorites.filter((_, i) => i !== index);
      set({ favorites: newFavorites });
      saveToLocalStorage(STORAGE_KEYS.FAVORITES, newFavorites);

      if (useAuthStore.getState().isAuthenticated) {
        syncFavorite(state.favorites[index], false, index);
      }
    },

    clearFavorites: () => {
      const previous = get().favorites;
      set({ favorites: [] });
      saveToLocalStorage(STORAGE_KEYS.FAVORITES, []);
      if (!useAuthStore.getState().isAuthenticated) return;

      const epoch = libraryEpoch;
      enqueueWrite('favorites', async () => {
        try {
          await userApi.clearFavorites();
        } catch (error) {
          if (epoch !== libraryEpoch) return;
          updateFavorites((current) => [
            ...previous,
            ...current.filter(t => !previous.some(p => String(p.id) === String(t.id))),
          ]);
          reportLibraryFailure("Couldn't clear your favorites", error);
        }
      });
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
        syncNewPlaylist(importedPlaylist.id, uniqueName);
      }
    },

    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    closeSidebar: () => set({ isSidebarOpen: false }),
    setCurrentView: (view) => set((state) => ({ currentView: view, detailEntity: null, viewRequestId: state.viewRequestId + 1 })),
    openAlbum: (id: string) => set((state) => ({ currentView: 'album', detailEntity: { kind: 'album', id }, viewRequestId: state.viewRequestId + 1 })),
    openGenre: (id: string) => set((state) => ({ currentView: 'genre', detailEntity: { kind: 'genre', id }, viewRequestId: state.viewRequestId + 1 })),
    openPlaylist: (id: string) => set((state) => ({ currentView: 'playlist', detailEntity: { kind: 'playlist', id }, viewRequestId: state.viewRequestId + 1 })),

    toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen })),
    closeQueue: () => set({ isQueueOpen: false }),

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
