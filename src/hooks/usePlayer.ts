import { useCallback, useEffect, useRef } from 'react';
import type { Track } from '../types/types';
import { STORAGE_KEYS } from '../config/constants';
import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from '../services/musicApi';

let singletonAudio: HTMLAudioElement | null = null;
let listenersAttached = false;

let loadedSrc = '';
let loadedTrackId = '';
let srcGeneration = 0;

let recoveryTrackId = '';
let recoveryStage = 0;

let lastReportedTime = -1;
let suppressPauseEvent = false;

export function getAudio(): HTMLAudioElement {
  if (!singletonAudio) {
    const existing = typeof document !== 'undefined' ? document.getElementById('music-player-audio') as HTMLAudioElement | null : null;
    singletonAudio = existing || new Audio();
    singletonAudio.id = 'music-player-audio';
    singletonAudio.preload = 'auto';
    if (typeof document !== 'undefined' && document.body && !document.body.contains(singletonAudio)) document.body.appendChild(singletonAudio);
  }
  return singletonAudio;
}

export function seekAudio(targetTime: number) {
  const audio = getAudio();
  const state = usePlayerStore.getState();
  const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : state.duration || state.currentTrack?.duration || 0;
  const time = Math.max(0, max ? Math.min(targetTime, max) : targetTime);
  if (!Number.isFinite(time) || !state.currentTrack) return;
  try {
    audio.currentTime = time;
    state.setCurrentTime(time);
  } catch {
    /* Not seekable until metadata lands; playback continues from where it is. */
  }
}

function persistPlayback() {
  const { currentTrack, currentTime } = usePlayerStore.getState();
  if (!currentTrack || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEYS.PLAYBACK, JSON.stringify({ track: currentTrack, position: currentTime }));
}

function updateMediaSession(track: Track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.name,
    artist: track.artist_name,
    album: track.album_name,
    artwork: [{ src: track.image || track.album_image || '/Favicon.png', sizes: '512x512', type: 'image/jpeg' }],
  });
}

function attachAudioListeners(audio: HTMLAudioElement) {
  if (listenersAttached) return;
  listenersAttached = true;
  const store = () => usePlayerStore.getState();
  audio.addEventListener('timeupdate', () => {
    if (Math.abs(audio.currentTime - lastReportedTime) >= 0.15 || lastReportedTime < 0) {
      lastReportedTime = audio.currentTime;
      store().setCurrentTime(audio.currentTime);
      if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration) });
        } catch {
          /* Throws on a non-finite position; the lock-screen scrubber is cosmetic. */
        }
      }
      persistPlayback();
    }
  });
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) store().setDuration(audio.duration);
  });
  audio.addEventListener('waiting', () => store().setBuffering(true));
  audio.addEventListener('stalled', () => store().setBuffering(true));
  audio.addEventListener('canplay', () => {
    const state = store();
    state.setBuffering(false);
    if (state.isPlaying && audio.paused && audio.currentSrc) {
      const generation = srcGeneration;
      if (loadedSrc && loadedSrc === audio.currentSrc) {
        void audio.play().catch((err) => {
          if (err?.name === 'AbortError' || generation !== srcGeneration) return;
          state.setPlaybackError('Playback could not start. Please try again.');
        });
      }
    }
  });
  audio.addEventListener('playing', () => { store().setBuffering(false); store().setIsPlaying(true); });
  audio.addEventListener('pause', () => { if (!audio.ended && !suppressPauseEvent) store().setIsPlaying(false); });
  audio.addEventListener('ended', () => {
    const state = store();
    if (state.repeatMode === 'one') { audio.currentTime = 0; void audio.play().catch(() => {}); } else state.nextTrack();
  });
  audio.addEventListener('error', () => {
    const state = store();
    const track = state.currentTrack;
    if (!track) return;

    if (recoveryTrackId !== track.id) {
      recoveryTrackId = track.id;
      recoveryStage = 0;
    }

    const applySource = (nextSrc: string) => {
      loadedSrc = nextSrc;
      loadedTrackId = track.id;
      srcGeneration += 1;
      const generation = srcGeneration;
      audio.src = nextSrc;
      audio.load();
      if (usePlayerStore.getState().isPlaying) {
        void audio.play().catch((err) => {
          if (err?.name === 'AbortError' || generation !== srcGeneration) return;
          usePlayerStore.getState().setPlaybackError('Playback could not start. Please try again.');
        });
      }
    };

    const fail = () => {
      recoveryStage = 3;
      const live = usePlayerStore.getState();
      live.setBuffering(false);
      live.setIsPlaying(false);
      live.setPlaybackError('This stream is unavailable. Check your connection and retry.');
    };

    if (recoveryStage === 0) {
      recoveryStage = 1;
      const current = audio.currentSrc;
      const alternate = [track.audio, track.audiodownload].filter(Boolean).find((c) => c !== current);
      if (alternate) {
        applySource(alternate);
        return;
      }
    }

    if (recoveryStage === 1) {
      recoveryStage = 2;
      const failedSrc = audio.currentSrc;
      const generation = srcGeneration;
      state.setBuffering(true);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      void MusicAPI.getTrackById(track.id, controller.signal)
        .then((fresh) => {
          clearTimeout(timer);
          const live = usePlayerStore.getState();
          if (generation !== srcGeneration || live.currentTrack?.id !== track.id) return;
          const refreshed = fresh?.audio || fresh?.audiodownload || '';
          if (refreshed && refreshed !== failedSrc) {
            applySource(refreshed);
            return;
          }
          fail();
        })
        .catch(() => {
          clearTimeout(timer);
          const live = usePlayerStore.getState();
          if (generation !== srcGeneration || live.currentTrack?.id !== track.id) return;
          fail();
        });
      return;
    }

    fail();
  });
}

export function usePlayer() {
  const audio = getAudio();
  const restored = useRef(false);
  const state = usePlayerStore();
  const { currentTrack, isPlaying, volume, isMuted, queue, currentIndex, isShuffling, repeatMode, playTrack, pauseTrack, nextTrack, previousTrack, setIsPlaying, setVolume, toggleMute, setBuffering, setPlaybackError } = state;

  useEffect(() => {
    attachAudioListeners(audio);
  }, [audio]);
  useEffect(() => {
    if (restored.current || currentTrack || typeof sessionStorage === 'undefined') return;
    restored.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.PLAYBACK) || '');
      if (saved?.track?.id) usePlayerStore.setState({ currentTrack: saved.track, currentTime: Number(saved.position) || 0, duration: saved.track.duration || 0, isPlaying: false });
    } catch {
      /* No resumable session; the player simply starts empty. */
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!currentTrack) {
      if (loadedSrc) {
        suppressPauseEvent = true;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        loadedSrc = '';
        loadedTrackId = '';
        recoveryTrackId = '';
        recoveryStage = 0;
        srcGeneration += 1;
        queueMicrotask(() => { suppressPauseEvent = false; });
      }
      return;
    }
    updateMediaSession(currentTrack);
    const src = currentTrack.audio || currentTrack.audiodownload || '';
    if (src && loadedTrackId === currentTrack.id && loadedSrc) {
      setBuffering(isPlaying ? audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA : false);
      return;
    }
    srcGeneration += 1;
    loadedSrc = src;
    loadedTrackId = currentTrack.id;
    recoveryTrackId = currentTrack.id;
    recoveryStage = 0;
    lastReportedTime = -1;
    suppressPauseEvent = true;
    audio.pause();
    queueMicrotask(() => { suppressPauseEvent = false; });
    audio.removeAttribute('src');
    audio.load();
    if (src) {
      audio.src = src;
      audio.load();
    }
    setPlaybackError(null);
    setBuffering(isPlaying && !!src);
  }, [audio, currentTrack, isPlaying, setBuffering, setPlaybackError]);

  useEffect(() => {
    if (!currentTrack) return;
    const src = currentTrack.audio || currentTrack.audiodownload || '';
    if (!src) return;
    if (isPlaying) {
      if (!loadedSrc || audio.src !== loadedSrc) return;
      const generation = srcGeneration;
      setBuffering(audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
      void audio.play().catch((err) => {
        if (err?.name === 'AbortError') return;
        if (generation !== srcGeneration) return;
        setIsPlaying(false);
        setPlaybackError('Playback was blocked or the stream could not start. Retry to continue.');
      });
    } else if (!audio.paused) audio.pause();
  }, [audio, currentTrack, isPlaying, setBuffering, setIsPlaying, setPlaybackError]);

  useEffect(() => {
    audio.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume / 100));
  }, [audio, volume, isMuted]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => pauseTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack', () => previousTrack());
    navigator.mediaSession.setActionHandler('seekbackward', () => seekAudio(audio.currentTime - 10));
    navigator.mediaSession.setActionHandler('seekforward', () => seekAudio(audio.currentTime + 10));
  }, [audio, nextTrack, pauseTrack, previousTrack, setIsPlaying]);
  useEffect(() => () => persistPlayback(), []);

  const play = useCallback((track?: Track) => { if (track) playTrack(track); else setIsPlaying(true); }, [playTrack, setIsPlaying]);
  const pause = useCallback(() => pauseTrack(), [pauseTrack]);
  const togglePlayPause = useCallback(() => { if (isPlaying) pause(); else play(); }, [isPlaying, pause, play]);
  const retry = useCallback(() => {
    loadedTrackId = '';
    recoveryTrackId = '';
    recoveryStage = 0;
    setPlaybackError(null);
    setIsPlaying(true);
  }, [setIsPlaying, setPlaybackError]);
  return { currentTrack, isPlaying, isBuffering: state.isBuffering, playbackError: state.playbackError, volume, isMuted, queue, currentIndex, isShuffling, repeatMode, play, pause, togglePlayPause, nextTrack, previousTrack, seek: seekAudio, changeVolume: setVolume, mute: toggleMute, retry, audioRef: { current: audio } };
}