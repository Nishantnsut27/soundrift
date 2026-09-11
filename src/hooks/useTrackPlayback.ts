import { useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import type { QueueContext, Track } from '../types/types';

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
 *
 * @param queue   The list the card belongs to. Given one, playing a card queues
 *                the whole list so Next walks the row the listener is looking at
 *                instead of dead-ending on a queue of one. May be longer than
 *                what is rendered: a row shows six cards, the section has more,
 *                and Next should reach them.
 * @param context What that list is, which decides whether the suggestion engine
 *                may extend it. Omit both to play the track alone.
 */
export function useTrackPlayback(queue?: Track[], context?: QueueContext) {
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

      if (!queue || queue.length === 0 || !context) {
        playTrack(track);
        return;
      }

      const index = queue.findIndex((item) => String(item.id) === String(track.id));
      /* Rendered from a different list than the one passed: play it alone rather
         than starting the queue somewhere the listener did not click. */
      if (index === -1) {
        playTrack(track);
        return;
      }

      playTrack(track, queue, index, context);
    },
    [currentTrackId, isPlaying, pauseTrack, setIsPlaying, playTrack, queue, context],
  );

  return { toggleTrack, currentTrackId, isPlaying };
}
