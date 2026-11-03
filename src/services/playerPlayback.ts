import type { QueueEntry, Track } from '../types/types';
import { STORAGE_KEYS } from '../config/constants';
import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from './musicApi';
import { TrackPrefetcher, type PreparedTrack } from './trackPrefetch';
import { getUpcomingQueueIndexes } from '../utils/queuePlayback';
import { FALLBACK_ART } from '../utils/artwork';
import { prefetchTarget } from './audioPreparation';
import { initializeCachedAudioRoute, subscribeCachedAudioRoute } from './cachedAudioRoute';
import { getAudioBufferStatus } from './audioBufferStatus';
import { recordPlaybackDiagnostic, initializePlaybackDiagnostics } from './playbackDiagnostics';
import { initializeNativePlayback, retryNativePlayback, seekNativePlayback, usesNativePlayback } from './nativePlayback';
import { getPlaybackDuration } from '../utils/playbackPosition';

let singletonAudio: HTMLAudioElement | null = null;
let initialized = false;
let loadedTrack: Track | null = null;
let loadedSession = -1;
let loadedSrc = '';
let sourceGeneration = 0;
let playAttempt = 0;
let pendingPlay: number | null = null;
type RecoveryStage = 'initial' | 'retry' | 'alternate' | 'refreshing' | 'refreshed' | 'failed';
let recoveryStage: RecoveryStage = 'initial';
// Seconds of uninterrupted playback after which a recovered stream counts as
// healthy again, so a later error in the same song gets the full recovery path.
const HEALTHY_PLAYBACK_SECONDS = 15;
let healthyProgress = 0;
let progressMark = -1;
let lastReportedTime = -1;
let restorePosition = 0;
let pendingSeek: { track: Track; session: number; position: number } | null = null;
const trackPrefetcher = new TrackPrefetcher();
let activePreparedTrack: PreparedTrack | null = null;
let syncingPlayback = false;
let interruptedPlayback: { track: Track; session: number } | null = null;
let automaticResumeUsed = false;
let reportingFailure = false;
let offlineResolutionId = 0;
let resolvingSource = false;
let lastProgressAt = Date.now();
let lastObservedPosition = -1;
let lastPersistedAt = 0;

export function getAudio(): HTMLAudioElement {
  if (!singletonAudio) {
    singletonAudio = document.getElementById('music-player-audio') as HTMLAudioElement | null || new Audio();
    singletonAudio.id = 'music-player-audio';
    singletonAudio.preload = 'auto';
    if (!document.body.contains(singletonAudio)) document.body.appendChild(singletonAudio);
  }
  return singletonAudio;
}

export function seekAudio(targetTime: number) {
  const state = usePlayerStore.getState();
  if (!Number.isFinite(targetTime) || !state.currentTrack) return;
  if (seekNativePlayback(targetTime)) return;
  const audio = getAudio();
  const sourceReady = loadedTrack === state.currentTrack && !!loadedSrc && !resolvingSource && audio.readyState > 0;
  const max = getPlaybackDuration(sourceReady ? audio.duration : undefined, state.duration, state.currentTrack.duration);
  if (!max) return;
  const time = Math.max(0, Math.min(targetTime, max));
  pendingSeek = { track: state.currentTrack, session: state.sessionId, position: time };
  if (!sourceReady) {
    state.setCurrentTime(time);
    return;
  }
  try {
    audio.currentTime = time;
    pendingSeek = null;
    restorePosition = 0;
    state.setCurrentTime(time);
  } catch {
    // Some engines expose metadata before accepting a seek; retry on canplay.
    state.setCurrentTime(time);
  }
}

/** Read at activation time, so repeated presses never reuse a rendered position. */
export function seekBy(seconds: number) {
  const state = usePlayerStore.getState();
  if (!state.currentTrack || state.playbackError || !Number.isFinite(seconds)) return;
  let position = state.currentTime;
  let duration = getPlaybackDuration(state.duration, state.currentTrack.duration);
  if (!usesNativePlayback()) {
    const audio = getAudio();
    if (loadedTrack === state.currentTrack && loadedSrc && !resolvingSource && audio.readyState > 0 && !pendingSeek) {
      position = audio.currentTime;
      duration = getPlaybackDuration(audio.duration, duration);
    }
  }
  if (!duration || !Number.isFinite(position)) return;
  const start = Math.max(0, Math.min(duration, position));
  seekAudio(Math.max(0, Math.min(duration, start + seconds)));
}

function applyPendingSeek() {
  const state = usePlayerStore.getState();
  if (!pendingSeek) return;
  if (pendingSeek.track !== state.currentTrack || pendingSeek.session !== state.sessionId) {
    pendingSeek = null;
    return;
  }
  seekAudio(pendingSeek.position);
}

function persistPlayback(force = true) {
  if (!force && Date.now() - lastPersistedAt < 5_000) return;
  lastPersistedAt = Date.now();
  const { currentTrack, currentTime } = usePlayerStore.getState();
  try {
    if (currentTrack) sessionStorage.setItem(STORAGE_KEYS.PLAYBACK, JSON.stringify({ track: currentTrack, position: currentTime }));
    else sessionStorage.removeItem(STORAGE_KEYS.PLAYBACK);
  } catch {
    // Storage restrictions must not interrupt media event handlers.
  }
}

function setMediaPlaybackState(state: MediaSessionPlaybackState) {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state;
}

function updateMediaSession(track: Track | null) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = track && typeof MediaMetadata !== 'undefined' ? new MediaMetadata({
      title: track.name,
      artist: track.artist_name,
      album: track.album_name,
      artwork: [{ src: track.image || track.album_image || FALLBACK_ART }],
    }) : null;
  } catch {
    // Unsupported metadata or artwork must never prevent audio playback.
  }
}

function invalidatePlay() {
  playAttempt += 1;
  pendingPlay = null;
}

function requestPlay() {
  const audio = getAudio();
  const state = usePlayerStore.getState();
  if (!state.currentTrack || !state.isPlaying || !loadedSrc || resolvingSource || pendingPlay !== null) return;

  const attempt = ++playAttempt;
  const generation = sourceGeneration;
  pendingPlay = attempt;
  state.setBuffering(audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
  // Run in the store notification / media event, without waiting for a React
  // effect, timer, or fetch. Hidden pages can delay those extra scheduling steps.
  void audio.play().catch((error: unknown) => {
    if (attempt !== playAttempt || generation !== sourceGeneration) return;
    const name = error instanceof Error ? error.name : '';
    recordPlaybackDiagnostic('play-rejected', { name, generation });
    if (audio.error) return; // Media errors have their own recovery path.
    if (name === 'AbortError') {
      // Our own pauses and source changes invalidate the attempt first, so this is
      // the OS pausing (headset unplug, call) while play() was pending; the pause
      // event that carried it was ignored as the old source's.
      if (audio.paused) usePlayerStore.setState({ isPlaying: false, isBuffering: false });
      return;
    }
    usePlayerStore.setState({
      isPlaying: false,
      isBuffering: false,
      playbackError: name === 'NotAllowedError'
        ? 'Your browser paused playback. Tap Play to continue.'
        : 'Playback could not start. Retry to continue.',
    });
  }).finally(() => {
    if (pendingPlay === attempt) pendingPlay = null;
  });
}

function applySource(src: string, prepared: PreparedTrack | null = null) {
  const audio = getAudio();
  sourceGeneration += 1;
  invalidatePlay();
  loadedSrc = new URL(src, document.baseURI).href;
  const previousPrepared = activePreparedTrack;
  activePreparedTrack = prepared;
  resolvingSource = false;
  lastProgressAt = Date.now();
  lastObservedPosition = -1;
  if (prepared && !prepared.url.startsWith('blob:')) audio.crossOrigin = 'anonymous';
  else audio.removeAttribute('crossorigin');
  recordPlaybackDiagnostic('source', { storage: prepared?.storage || 'network', generation: sourceGeneration });
  // Keep the same user-activated element. Assigning src starts resource loading;
  // pause() + removing src + load() creates an unnecessary empty media session.
  audio.src = loadedSrc;
  if (previousPrepared !== prepared) previousPrepared?.release();
  if (usePlayerStore.getState().isPlaying) requestPlay();
}

function syncPlayback() {
  if (syncingPlayback) return;
  syncingPlayback = true;
  try { syncPlaybackState(); } finally { syncingPlayback = false; }
  syncNextTrackPreparation();
}

function syncNextTrackPreparation() {
  if (syncingPlayback) return;
  const state = usePlayerStore.getState();
  if (!state.currentTrack) { trackPrefetcher.clear(); return; }
  const target = prefetchTarget(state.queueContext);
  const upcoming = getUpcomingQueueIndexes(state, target)
    // Replaying the loaded occurrence from a local file needs no second copy.
    .filter(index => index !== state.currentIndex || !activePreparedTrack)
    .map(index => state.queue[index]);
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const audio = getAudio();
  // Only gates starting a download: transient buffering or the pause at `ended`
  // must not abort a file that is nearly on the device.
  let canDownload = state.isPlaying && !state.isBuffering && !audio.paused
    && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    && navigator.onLine !== false && !connection?.saveData && !connection?.effectiveType?.includes('2g');
  if (canDownload && activePreparedTrack === null) {
    // Give current playback priority: start once there is a 20-second cushion,
    // or the rest of the current song is already buffered.
    canDownload = false;
    for (let index = 0; index < audio.buffered.length && !canDownload; index++) {
      if (audio.buffered.start(index) > audio.currentTime) continue;
      const end = audio.buffered.end(index);
      canDownload = end - audio.currentTime >= 20
        || (Number.isFinite(audio.duration) && end >= audio.duration - 0.25);
    }
  }
  const limited = navigator.onLine === false ? 'offline'
    : connection?.saveData || connection?.effectiveType?.includes('2g') ? 'data-saver'
    : !state.isPlaying ? 'paused' : !canDownload ? 'buffering' : null;
  trackPrefetcher.sync({ current: state.currentTrack, upcoming, history: state.playbackHistory, target, canDownload, limited });
}

function syncPlaybackState() {
  const audio = getAudio();
  const state = usePlayerStore.getState();
  audio.volume = state.isMuted ? 0 : Math.max(0, Math.min(1, state.volume / 100));

  if (!state.currentTrack) {
    pendingSeek = null;
    restorePosition = 0;
    offlineResolutionId += 1;
    resolvingSource = false;
    interruptedPlayback = null;
    automaticResumeUsed = false;
    trackPrefetcher.clear();
    if (loadedTrack) {
      loadedTrack = null;
      loadedSrc = '';
      sourceGeneration += 1;
      invalidatePlay();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      activePreparedTrack?.release();
      activePreparedTrack = null;
      updateMediaSession(null);
      persistPlayback();
    }
    setMediaPlaybackState('none');
    return;
  }

  // Clearing Up Next invalidates recommendations, but must not reload the song.
  if (loadedTrack !== state.currentTrack || (loadedSession !== state.sessionId && !state.autoQueueSuppressed)
    || (state.isPlaying && recoveryStage === 'failed')) {
    pendingSeek = null;
    const prepared = trackPrefetcher.take(state.currentTrack);
    automaticResumeUsed = false;
    interruptedPlayback = null;
    loadedTrack = state.currentTrack;
    loadedSession = state.sessionId;
    recoveryStage = 'initial';
    lastReportedTime = -1;
    restorePosition = state.currentTime;
    const track = loadedTrack;
    const src = track.audio || track.audiodownload;
    state.setPlaybackError(null);

    if (!src && !prepared) {
      sourceGeneration += 1;
      invalidatePlay();
      loadedSrc = '';
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      activePreparedTrack?.release();
      activePreparedTrack = null;
      usePlayerStore.setState({ isPlaying: false, isBuffering: false, playbackError: 'This track has no playable stream.' });
      return;
    }

    const resolutionId = ++offlineResolutionId;
    if (prepared) {
      applySource(prepared.url, prepared);
      updateMediaSession(track);
    } else {
      resolvingSource = true;
      invalidatePlay();
      loadedSrc = '';
      state.setBuffering(state.isPlaying);
      void trackPrefetcher.resolve(track).then((localPrepared) => {
        if (resolutionId !== offlineResolutionId || usePlayerStore.getState().currentTrack !== track) {
          localPrepared?.release();
          return;
        }
        resolvingSource = false;
        if (localPrepared) {
          applySource(localPrepared.url, localPrepared);
        } else if (src) {
          applySource(src);
        } else {
          usePlayerStore.setState({ isPlaying: false, isBuffering: false, playbackError: 'This track has no playable stream.' });
        }
        updateMediaSession(track);
      }).catch(() => {
        if (resolutionId !== offlineResolutionId || usePlayerStore.getState().currentTrack !== track) return;
        resolvingSource = false;
        if (src) applySource(src);
        else usePlayerStore.setState({ isPlaying: false, isBuffering: false, playbackError: 'This track could not be loaded.' });
        updateMediaSession(track);
      });
    }
  } else if (state.isPlaying && audio.paused) {
    requestPlay();
  }
  loadedSession = state.sessionId;

  if (!state.isPlaying) {
    invalidatePlay();
    if (!audio.paused) audio.pause();
    state.setBuffering(false);
    setMediaPlaybackState('paused');
  }
}

function recoverStream(forcedCode?: number) {
  const audio = getAudio();
  const track = usePlayerStore.getState().currentTrack;
  if (!track || !loadedSrc || resolvingSource || (!audio.error && forcedCode === undefined)) return;
  healthyProgress = 0;
  progressMark = -1;

  const errorCode = forcedCode ?? audio.error!.code;
  recordPlaybackDiagnostic('recovery', { errorCode, stage: recoveryStage, generation: sourceGeneration });
  const retrySource = activePreparedTrack?.source || loadedSrc;
  const usedPreparedTrack = activePreparedTrack !== null;
  if (activePreparedTrack?.storage === 'automatic' && (errorCode === 3 || errorCode === 4)) trackPrefetcher.discard(track);
  // Preserve a partially played song when reloading its stream.
  restorePosition = Math.max(restorePosition, audio.currentTime);

  const fail = () => {
    recoveryStage = 'failed';
    const messages: Record<number, string> = {
      1: 'Loading this song was interrupted. Tap Retry to continue.',
      2: 'The audio could not be downloaded. Tap Retry to try this song again.',
      3: 'This audio file could not be decoded. Try another track.',
      4: 'This audio source is unavailable or unsupported. Tap Retry or choose another track.',
    };
    // MediaError does not expose HTTP status. Log useful context without signed
    // stream URLs, and do not imply navigator.onLine proves server reachability.
    console.warn('[Playback] Stream recovery failed', {
      trackId: track.id, mediaErrorCode: errorCode,
      visibility: document.visibilityState, reportedOnline: navigator.onLine,
    });
    const state = usePlayerStore.getState();
    if (state.isPlaying && !automaticResumeUsed && errorCode !== 3
      && (document.visibilityState === 'hidden' || !navigator.onLine)) {
      interruptedPlayback = { track, session: state.sessionId };
    }
    reportingFailure = true;
    try {
      usePlayerStore.setState({ isPlaying: false, isBuffering: false,
        playbackError: messages[errorCode] || 'This song could not be loaded. Tap Retry or choose another track.' });
    } finally { reportingFailure = false; }
  };

  if (recoveryStage === 'initial') {
    recoveryStage = 'retry';
    // A temporary transport/source-load failure can recover with the same URL.
    // Retry once without introducing an API round trip during the handoff.
    if (errorCode !== 3 || usedPreparedTrack) {
      applySource(retrySource);
      return;
    }
  }
  if (recoveryStage === 'retry') {
    recoveryStage = 'alternate';
    const alternate = [track.audio, track.audiodownload].filter(Boolean)
      .find(src => new URL(src, document.baseURI).href !== loadedSrc);
    if (alternate) {
      applySource(alternate);
      return;
    }
  }
  if (recoveryStage !== 'alternate') {
    if (recoveryStage !== 'refreshing' && recoveryStage !== 'failed') fail();
    return;
  }

  recoveryStage = 'refreshing';
  const generation = sourceGeneration;
  const controller = new AbortController();
  // The provider itself can make two 8-second attempts before returning.
  const timer = setTimeout(() => controller.abort(), 20000);
  usePlayerStore.getState().setBuffering(usePlayerStore.getState().isPlaying);
  void MusicAPI.getTrackById(track.id, controller.signal, { refresh: true }).then(fresh => {
    if (generation !== sourceGeneration || usePlayerStore.getState().currentTrack !== track) return;
    const refreshed = fresh?.audio || fresh?.audiodownload;
    if (fresh && refreshed) {
      // A valid provider URL need not change after a temporary failure. Mark
      // this final attempt separately from the pending request to bound retries.
      recoveryStage = 'refreshed';
      applySource(refreshed);
      rememberRefreshedStream(track, fresh);
    } else fail();
  }).catch(() => {
    if (generation === sourceGeneration && usePlayerStore.getState().currentTrack === track) fail();
  }).finally(() => clearTimeout(timer));
}

/**
 * Keeps a refreshed stream URL on the playing queue entry, so Previous or a
 * repeat pass comes back to it instead of the expired one. `currentTrack` is
 * left as it is: a new object there would reload the song that is playing.
 */
function rememberRefreshedStream(track: Track, fresh: Track) {
  const { queue, currentIndex } = usePlayerStore.getState();
  const entry = queue[currentIndex];
  if (!entry || String(entry.id) !== String(track.id)) return;
  const updated: QueueEntry = { ...entry, audio: fresh.audio || '', audiodownload: fresh.audiodownload || '' };
  usePlayerStore.setState({ queue: queue.map((item, index) => (index === currentIndex ? updated : item)) });
}

function replayFromStart() {
  const track = usePlayerStore.getState().currentTrack;
  // A streamed song may no longer be buffered from its start; its local copy is.
  const prepared = track && !activePreparedTrack ? trackPrefetcher.take(track) : null;
  if (prepared) {
    recoveryStage = 'initial';
    restorePosition = 0;
    applySource(prepared.url, prepared);
    return;
  }
  getAudio().currentTime = 0;
  requestPlay();
}

function attachAudioListeners(audio: HTMLAudioElement) {
  audio.addEventListener('timeupdate', () => {
    // The previous source can still emit events while its replacement resolves.
    if (resolvingSource || !loadedSrc || loadedTrack !== usePlayerStore.getState().currentTrack || pendingSeek) return;
    if (Math.abs(audio.currentTime - lastObservedPosition) > 0.05) {
      lastObservedPosition = audio.currentTime;
      lastProgressAt = Date.now();
      if (!audio.paused && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) usePlayerStore.getState().setBuffering(false);
    }
    if (recoveryStage === 'retry' || recoveryStage === 'alternate' || recoveryStage === 'refreshed') {
      // Small forward steps only: a seek or a restored position is not playback.
      const step = audio.currentTime - progressMark;
      if (progressMark >= 0 && step > 0 && step < 2 && !audio.paused) healthyProgress += step;
      progressMark = audio.currentTime;
      if (healthyProgress >= HEALTHY_PLAYBACK_SECONDS) {
        recoveryStage = 'initial';
        healthyProgress = 0;
        progressMark = -1;
      }
    }
    if (Math.abs(audio.currentTime - lastReportedTime) < 0.15 && lastReportedTime >= 0) return;
    lastReportedTime = audio.currentTime;
    usePlayerStore.getState().setCurrentTime(audio.currentTime);
    if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({ duration: audio.duration,
          position: Math.max(0, Math.min(audio.currentTime, audio.duration)), playbackRate: audio.playbackRate });
      } catch {
        // Position reporting is optional on some browsers.
      }
    }
    persistPlayback(false);
  });
  audio.addEventListener('loadedmetadata', () => {
    if (resolvingSource || !loadedSrc || loadedTrack !== usePlayerStore.getState().currentTrack) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) usePlayerStore.getState().setDuration(audio.duration);
    if (pendingSeek) applyPendingSeek();
    else if (restorePosition > 0) seekAudio(restorePosition);
    restorePosition = 0;
  });
  audio.addEventListener('progress', syncNextTrackPreparation);
  const buffering = (event: Event) => {
    recordPlaybackDiagnostic(event.type);
    usePlayerStore.getState().setBuffering(usePlayerStore.getState().isPlaying);
  };
  audio.addEventListener('waiting', buffering);
  audio.addEventListener('stalled', buffering);
  audio.addEventListener('canplay', () => {
    applyPendingSeek();
    usePlayerStore.getState().setBuffering(false);
    // Seeking to the end can emit canplay before ended. play() here would reset
    // the position to zero and swallow the normal queue/repeat transition.
    if (audio.paused && !audio.ended) requestPlay();
  });
  audio.addEventListener('playing', () => {
    if (audio.paused) return;
    usePlayerStore.setState({ isBuffering: false, isPlaying: true, playbackError: null });
    setMediaPlaybackState('playing');
  });
  audio.addEventListener('pause', () => {
    // A queued pause from the previous source can arrive after its replacement's
    // play(). A microtask flag cannot guard this task-queue race.
    if (!audio.paused || audio.ended || pendingPlay !== null || audio.error) return;
    usePlayerStore.setState({ isPlaying: false, isBuffering: false });
    setMediaPlaybackState('paused');
  });
  const advanceAtEnd = () => {
    const before = usePlayerStore.getState();
    if (!before.isPlaying || !audio.ended || resolvingSource) return;
    recordPlaybackDiagnostic('ended', { generation: sourceGeneration });
    if (before.repeatMode === 'one') {
      replayFromStart();
      return;
    }
    before.nextTrack(); // The synchronous subscription loads and plays the next source here.
    const after = usePlayerStore.getState();
    if (after.isPlaying && after.currentTrack === before.currentTrack) {
      // Repeat-all with one queue entry, or none left, leaves the selection unchanged.
      replayFromStart();
    }
  };
  audio.addEventListener('ended', advanceAtEnd);
  audio.addEventListener('error', () => recoverStream());
  // Timers are only recovery opportunities, never a background execution promise.
  window.setInterval(() => {
    const state = usePlayerStore.getState();
    if (!state.isPlaying || !state.currentTrack || resolvingSource || audio.seeking) return;
    if (audio.ended) { advanceAtEnd(); return; }
    if (Math.abs(audio.currentTime - lastObservedPosition) > 0.05) {
      lastObservedPosition = audio.currentTime;
      lastProgressAt = Date.now();
      return;
    }
    if (Date.now() - lastProgressAt >= 20_000 && recoveryStage !== 'refreshing' && recoveryStage !== 'failed') {
      lastProgressAt = Date.now();
      // A late download may now have the current file locally.
      const prepared = !activePreparedTrack && trackPrefetcher.take(state.currentTrack);
      if (prepared) { restorePosition = audio.currentTime; applySource(prepared.url, prepared); }
      else recoverStream(2);
    }
  }, 5_000);
}

function attachMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
    play: () => usePlayerStore.getState().setIsPlaying(true),
    pause: () => { interruptedPlayback = null; usePlayerStore.getState().pauseTrack(); },
    nexttrack: () => usePlayerStore.getState().nextTrack(),
    previoustrack: () => usePlayerStore.getState().previousTrack(),
    seekbackward: details => seekAudio(getAudio().currentTime - (details.seekOffset ?? 10)),
    seekforward: details => seekAudio(getAudio().currentTime + (details.seekOffset ?? 10)),
    seekto: details => { if (details.seekTime !== undefined) seekAudio(details.seekTime); },
    stop: () => usePlayerStore.getState().stopPlayback(),
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler);
    } catch {
      // One unsupported action must not prevent registration of the others.
    }
  }
}

/** One page-lifetime controller, initialized before React renders play buttons. */
export function initializePlayer() {
  if (initialized) return;
  initialized = true;
  if (initializeNativePlayback()) return;
  initializeCachedAudioRoute();
  subscribeCachedAudioRoute(() => trackPrefetcher.retryFailed());
  initializePlaybackDiagnostics(() => {
    const state = usePlayerStore.getState();
    return { trackId: state.currentTrack?.id, session: state.sessionId, playing: state.isPlaying,
      readyState: getAudio().readyState, networkState: getAudio().networkState,
      position: getAudio().currentTime, buffer: getAudioBufferStatus() };
  });
  const audio = getAudio();
  attachAudioListeners(audio);
  attachMediaSession();
  usePlayerStore.subscribe((state, previous) => {
    if (!reportingFailure && previous.isPlaying && !state.isPlaying) interruptedPlayback = null;
    if (state.currentTrack !== previous.currentTrack || state.sessionId !== previous.sessionId
      || state.isPlaying !== previous.isPlaying || state.volume !== previous.volume || state.isMuted !== previous.isMuted) syncPlayback();
    else syncNextTrackPreparation();
  });
  if (!usePlayerStore.getState().currentTrack) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.PLAYBACK) || 'null');
      if (saved?.track?.id) {
        // A queue of one, so the song can end and the suggestion engine can extend it.
        // The id cannot collide with the store's `q<n>` counter.
        const entry: QueueEntry = { ...saved.track, queueEntryId: 'restored' };
        usePlayerStore.setState({
          currentTrack: entry, queue: [entry], currentIndex: 0, currentTime: Number(saved.position) || 0,
          duration: entry.duration || 0, isPlaying: false,
        });
      }
    } catch {
      // No resumable session.
    }
  }
  syncPlayback();
  const resumeIfRequested = () => {
    recordPlaybackDiagnostic('resume');
    lastProgressAt = Date.now();
    const state = usePlayerStore.getState();
    if (interruptedPlayback && navigator.onLine && state.currentTrack === interruptedPlayback.track
      && state.sessionId === interruptedPlayback.session && !state.isPlaying) {
      interruptedPlayback = null;
      restartPlayback(true);
      return;
    }
    if (usePlayerStore.getState().isPlaying && audio.ended) audio.dispatchEvent(new Event('ended'));
    else if (usePlayerStore.getState().isPlaying && audio.paused) requestPlay();
    syncNextTrackPreparation();
  };
  document.addEventListener('visibilitychange', () => {
    recordPlaybackDiagnostic('visibility');
    persistPlayback();
    if (document.visibilityState === 'visible') { trackPrefetcher.retryFailed(); resumeIfRequested(); }
  });
  window.addEventListener('pageshow', resumeIfRequested);
  window.addEventListener('online', () => { trackPrefetcher.retryFailed(); resumeIfRequested(); });
  window.addEventListener('offline', syncNextTrackPreparation);
  window.addEventListener('pagehide', () => { recordPlaybackDiagnostic('pagehide'); persistPlayback(); });
  document.addEventListener('freeze', () => { recordPlaybackDiagnostic('freeze'); persistPlayback(); });
  document.addEventListener('resume', () => { trackPrefetcher.retryFailed(); resumeIfRequested(); });
  window.addEventListener('soundrift-offline-library-changed', () => trackPrefetcher.retryFailed());
  (navigator as Navigator & { connection?: EventTarget }).connection?.addEventListener('change', syncNextTrackPreparation);
}

function restartPlayback(automatic: boolean) {
  interruptedPlayback = null;
  loadedTrack = null;
  usePlayerStore.setState({ playbackError: null, isPlaying: true });
  // Also retry when the requested playing state was already true.
  syncPlayback();
  automaticResumeUsed = automatic;
}

export function retryPlayback() { if (!retryNativePlayback()) restartPlayback(false); }
