import { useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import type { Track } from '../types/types';

/**
 * The one play/pause gesture every card surface uses.
 *
 * This is deliberately a thin wrapper over the existing store actions rather
 * than any new playback state: `playTrack` owns the queue, the session id, the
 * recently-played list and the history write, and the singleton audio element in
 * usePlayer reacts to that state. Nothing here talks to audio directly.
 *
 * Semantics match TrackListModern exactly — tapping the track that is already
 * loaded toggles it instead of restarting it.
 */
export function useTrackPlayback() {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const pauseTrack = usePlayerStore((state) => state.pauseTrack);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);

  const currentTrackId = currentTrack?.id;

  const toggleTrack = useCallback(
    (track: Track) => {
      if (currentTrackId === track.id) {
        if (isPlaying) pauseTrack();
        else setIsPlaying(true);
        return;
      }
      playTrack(track);
    },
    [currentTrackId, isPlaying, pauseTrack, setIsPlaying, playTrack],
  );

  return { toggleTrack, currentTrackId, isPlaying };
}
