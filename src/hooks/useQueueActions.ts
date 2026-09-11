import { useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useToastStore } from '../store/toastStore';
import type { Track } from '../types/types';

export function useQueueActions() {
  const addToQueueAction = usePlayerStore((state) => state.addToQueue);
  const playNextAction = usePlayerStore((state) => state.playNext);
  const addToast = useToastStore((state) => state.addToast);

  const addToQueue = useCallback(
    (track: Track) => {
      addToQueueAction(track);
      addToast({ type: 'success', message: `Added to queue: ${track.name}` });
    },
    [addToQueueAction, addToast],
  );

  const playNext = useCallback(
    (track: Track) => {
      playNextAction(track);
      addToast({ type: 'success', message: `Playing next: ${track.name}` });
    },
    [playNextAction, addToast],
  );

  return { addToQueue, playNext };
}
