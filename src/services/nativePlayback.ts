import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { BACKEND_URL } from '../config/constants';
import { usePlayerStore } from '../store/playerStore';
import type { QueueContext, QueueEntry } from '../types/types';
import { cacheKeyOf, prefetchTarget } from './audioPreparation';
import { setAudioBufferStatus, type AudioBufferStatus } from './audioBufferStatus';
import { getPlaybackDuration } from '../utils/playbackPosition';

export interface NativeQueueTrack extends QueueEntry { cacheKey: string }
export interface NativePlaybackSnapshot {
  revision: number;
  queue: NativeQueueTrack[];
  currentIndex: number;
  position: number;
  duration?: number;
  playing: boolean;
  buffering?: boolean;
  error?: string | null;
  repeatMode: 'none' | 'one' | 'all';
  context: QueueContext;
  shuffling?: boolean;
  originalOrder?: string[];
  target: number;
  volume: number;
  autoplay: boolean;
  autoplayEnabled?: boolean;
  autoQueueSuppressed?: boolean;
  userVolume?: number;
  muted?: boolean;
  seekPosition?: number;
  retry?: boolean;
  select?: boolean;
  queueChanged?: boolean;
  apiBase: string;
  buffer?: AudioBufferStatus;
}
interface NativePlaybackPlugin {
  configure(snapshot: NativePlaybackSnapshot): Promise<void>;
  getState(): Promise<NativePlaybackSnapshot>;
  addListener(event: 'state', listener: (state: NativePlaybackSnapshot) => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<NativePlaybackPlugin>('SoundriftPlayback');
export const usesNativePlayback = () => Capacitor.isNativePlatform();
let applying = false;
let initialized = false;
let revision = Date.now();
let changed = false;
let pending: NativePlaybackSnapshot | null = null;
let sending = false;
let connection: Promise<void> | null = null;
let connected = false;
let listener: PluginListenerHandle | null = null;

type StoreState = ReturnType<typeof usePlayerStore.getState>;
function selectedEntry(state: StoreState): QueueEntry | null {
  const track = state.currentTrack as QueueEntry | null;
  if (!track) return null;
  const current = state.queue[state.currentIndex];
  if (current && current.id === track.id && current.provider === track.provider
    && (!track.queueEntryId || track.queueEntryId === current.queueEntryId)) return current;
  return { ...track, queueEntryId: track.queueEntryId || 'detached:' + (track.provider || 'default') + ':' + track.id };
}

export function createNativeSnapshot(state: ReturnType<typeof usePlayerStore.getState>, nextRevision: number): NativePlaybackSnapshot {
  const ordered = state.isShuffling ? state.shuffleOrder.map(index => state.queue[index]).filter(Boolean) : [...state.queue];
  const originalOrder = state.queue.map(entry => entry.queueEntryId);
  const current = selectedEntry(state);
  let index = current ? ordered.findIndex(entry => entry.queueEntryId === current.queueEntryId) : -1;
  if (current && index < 0) {
    ordered.unshift(current);
    originalOrder.unshift(current.queueEntryId);
    index = 0;
  }
  return {
    revision: nextRevision, queue: ordered.map(track => ({ ...track, cacheKey: cacheKeyOf(track) })), currentIndex: index,
    position: state.isPlaying && state.duration > 0 && state.currentTime >= state.duration ? 0 : state.currentTime,
    playing: state.isPlaying, repeatMode: state.repeatMode,
    context: state.queueContext, shuffling: state.isShuffling, originalOrder,
    target: prefetchTarget(state.queueContext), volume: state.isMuted ? 0 : state.volume / 100,
    autoplay: state.autoplayEnabled && !state.autoQueueSuppressed && !['playlist', 'album'].includes(state.queueContext.kind),
    autoplayEnabled: state.autoplayEnabled, autoQueueSuppressed: state.autoQueueSuppressed, userVolume: state.volume, muted: state.isMuted,
    apiBase: BACKEND_URL,
  };
}

function reportError(): void {
  applying = true;
  try { usePlayerStore.setState({ isPlaying: false, isBuffering: false, playbackError: 'The native audio player could not start. Tap Retry to continue.' }); }
  finally { applying = false; }
}

function receive(snapshot: NativePlaybackSnapshot): void {
  if (!connected || snapshot.revision < revision || !Array.isArray(snapshot.queue)) return;
  revision = snapshot.revision;
  applying = true;
  try {
    const state = usePlayerStore.getState();
    const selected = snapshot.queue[snapshot.currentIndex];
    const incomingIds = new Set(snapshot.queue.map(track => track.queueEntryId));
    const nativeById = new Map(snapshot.queue.map(track => [track.queueEntryId, track]));
    const queue = state.queue.filter(track => incomingIds.has(track.queueEntryId)).map(track => nativeById.get(track.queueEntryId) || track);
    const known = new Set(queue.map(track => track.queueEntryId));
    queue.push(...snapshot.queue.filter(track => !known.has(track.queueEntryId)));
    if (snapshot.originalOrder) {
      const order = new Map(snapshot.originalOrder.map((id, index) => [id, index]));
      queue.sort((a, b) => (order.get(a.queueEntryId) ?? Infinity) - (order.get(b.queueEntryId) ?? Infinity));
    }
    const index = selected ? queue.findIndex(track => track.queueEntryId === selected.queueEntryId) : -1;
    const oldEntry = state.queue[state.currentIndex];
    const changedTrack = selected && oldEntry && selected.queueEntryId !== oldEntry.queueEntryId;
    const shuffling = snapshot.shuffling ?? state.isShuffling;
    const shuffleOrder = shuffling ? snapshot.queue.map(track => queue.findIndex(item => item.queueEntryId === track.queueEntryId)) : [];
    usePlayerStore.setState({ queue, currentIndex: index, currentTrack: selected || null,
      currentTime: snapshot.position || 0, duration: snapshot.duration || selected?.duration || 0,
      isPlaying: snapshot.playing, isBuffering: !!snapshot.buffering, playbackError: snapshot.error || null,
      queueContext: snapshot.context || { kind: 'single' }, repeatMode: snapshot.repeatMode,
      isShuffling: shuffling, shuffleOrder, shufflePosition: shuffling ? snapshot.currentIndex : 0,
      autoplayEnabled: snapshot.autoplayEnabled ?? state.autoplayEnabled, autoQueueSuppressed: snapshot.autoQueueSuppressed ?? state.autoQueueSuppressed,
      volume: snapshot.userVolume ?? state.volume, isMuted: snapshot.muted ?? state.isMuted,
      playbackHistory: changedTrack ? [...state.playbackHistory, oldEntry] : state.playbackHistory });
    if (snapshot.buffer) setAudioBufferStatus(snapshot.buffer);
  } finally { applying = false; }
}

function connect(): Promise<void> {
  if (connected) return Promise.resolve();
  if (connection) return connection;
  connection = (async () => {
    listener ??= await plugin.addListener('state', receive);
    const snapshot = await plugin.getState();
    connected = true;
    if (!changed && snapshot.queue?.length) { revision = snapshot.revision; receive(snapshot); }
    else {
      // A persisted native revision can be ahead of the page clock after a
      // clock change. A selection made during connection must still win.
      revision = Math.max(revision, snapshot.revision || 0) + 1;
      if (pending) pending.revision = revision;
      else if (!changed && usePlayerStore.getState().currentTrack) pending = createNativeSnapshot(usePlayerStore.getState(), revision);
    }
  })().finally(() => { connection = null; });
  return connection;
}

async function flush(): Promise<void> {
  if (sending) return;
  sending = true;
  try {
    await connect();
    while (pending) {
      const command = pending;
      pending = null;
      try { await plugin.configure(command); }
      catch { if (command.revision === revision) reportError(); }
    }
  } catch { pending = null; reportError(); }
  finally { sending = false; }
}

function enqueue(overrides: Pick<NativePlaybackSnapshot, 'seekPosition' | 'retry' | 'select' | 'queueChanged'> = {}): void {
  changed = true;
  revision = Math.max(revision + 1, Date.now());
  const next = createNativeSnapshot(usePlayerStore.getState(), revision);
  const sameEntry = pending?.queue[pending.currentIndex]?.queueEntryId === next.queue[next.currentIndex]?.queueEntryId;
  next.queueChanged = pending?.queueChanged ?? false;
  if (pending && sameEntry) { next.seekPosition = pending.seekPosition; next.retry = pending.retry; next.select = pending.select; }
  pending = { ...next, ...overrides };
  void flush();
}

/** Native owns the full queue and refill loop; JS is only a control surface. */
export function initializeNativePlayback(): boolean {
  if (!usesNativePlayback()) return false;
  if (initialized) return true;
  initialized = true;
  usePlayerStore.subscribe((state, previous) => {
    if (applying) return;
    if (state.currentTrack === previous.currentTrack && state.currentIndex === previous.currentIndex && state.queue === previous.queue
      && state.isPlaying === previous.isPlaying && state.volume === previous.volume && state.isMuted === previous.isMuted
      && state.repeatMode === previous.repeatMode && state.shuffleOrder === previous.shuffleOrder && state.isShuffling === previous.isShuffling
      && state.queueContext === previous.queueContext
      && state.autoplayEnabled === previous.autoplayEnabled && state.autoQueueSuppressed === previous.autoQueueSuppressed) return;
    const select = selectedEntry(state)?.queueEntryId !== selectedEntry(previous)?.queueEntryId;
    const queueChanged = state.queue !== previous.queue || state.shuffleOrder !== previous.shuffleOrder || state.isShuffling !== previous.isShuffling;
    enqueue({ ...(select ? { select: true } : {}), ...(queueChanged ? { queueChanged: true } : {}) });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void connect().then(() => plugin.getState()).then(receive).catch(reportError);
  });
  void flush();
  return true;
}

export function seekNativePlayback(position: number): boolean {
  if (!usesNativePlayback()) return false;
  if (!Number.isFinite(position)) return true;
  const state = usePlayerStore.getState();
  if (!state.currentTrack) return true;
  const duration = getPlaybackDuration(state.duration, state.currentTrack.duration);
  const target = Math.max(0, duration > 0 ? Math.min(position, duration) : position);
  applying = true;
  try { usePlayerStore.setState({ currentTime: target }); } finally { applying = false; }
  enqueue({ seekPosition: target });
  return true;
}

export function retryNativePlayback(): boolean {
  if (!usesNativePlayback()) return false;
  if (!usePlayerStore.getState().currentTrack) return true;
  applying = true;
  try { usePlayerStore.setState({ isPlaying: true, playbackError: null }); } finally { applying = false; }
  enqueue({ retry: true });
  return true;
}
