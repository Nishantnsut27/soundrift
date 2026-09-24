import { useCallback } from 'react';
import type { Track } from '../types/types';
import { usePlayerStore } from '../store/playerStore';
import { getAudio, retryPlayback, seekAudio } from '../services/playerPlayback';

export { getAudio, seekAudio } from '../services/playerPlayback';

export function usePlayer() {
  const state = usePlayerStore();
  const { currentTrack, isPlaying, volume, isMuted, queue, currentIndex, isShuffling, repeatMode, playTrack, pauseTrack, nextTrack, previousTrack, setIsPlaying, setVolume, toggleMute } = state;

  const play = useCallback((track?: Track) => { if (track) playTrack(track); else setIsPlaying(true); }, [playTrack, setIsPlaying]);
  const pause = useCallback(() => pauseTrack(), [pauseTrack]);
  const togglePlayPause = useCallback(() => { if (isPlaying) pause(); else play(); }, [isPlaying, pause, play]);
  return { currentTrack, isPlaying, isBuffering: state.isBuffering, playbackError: state.playbackError, volume, isMuted, queue, currentIndex, isShuffling, repeatMode, play, pause, togglePlayPause, nextTrack, previousTrack, seek: seekAudio, changeVolume: setVolume, mute: toggleMute, retry: retryPlayback, audioRef: { current: getAudio() } };
}
