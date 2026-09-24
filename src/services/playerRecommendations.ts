import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from './musicApi';

const TOP_UP_THRESHOLD = 2;
const REQUEST_BATCH = 10;

/** Queue maintenance must continue when React isn't rendering a hidden page. */
export function subscribeToRecommendations() {
  let generation = 0;
  let lastRequestKey = '';

  const topUp = () => {
    const state = usePlayerStore.getState();
    const source = state.currentTrack;
    const remaining = state.isShuffling && state.shuffleOrder.length > 0
      ? state.shuffleOrder.length - state.shufflePosition - 1
      : state.queue.length - state.currentIndex - 1;
    if (!source || !state.isPlaying || !state.autoplayEnabled || state.autoQueueSuppressed
      || state.repeatMode === 'one' || state.queueContext.kind === 'album'
      || state.queueContext.kind === 'playlist' || remaining > TOP_UP_THRESHOLD) {
      generation += 1;
      lastRequestKey = '';
      return;
    }

    const requestKey = `${state.sessionId}:${source.id}:${state.queue.length}:${remaining}`;
    if (requestKey === lastRequestKey) return;
    lastRequestKey = requestKey;
    const attempt = ++generation;
    const excludeIds = new Set([
      source.id, ...state.queue.map(track => track.id), ...state.playbackHistory.map(track => track.id),
      ...state.recentlyPlayed.slice(0, 30).map(track => track.id),
    ]);
    void MusicAPI.getRecommendations(source, excludeIds, REQUEST_BATCH).then(tracks => {
      const latest = usePlayerStore.getState();
      if (attempt !== generation || latest.sessionId !== state.sessionId || latest.currentTrack !== source) return;
      return latest.setRecommendations(tracks);
    }).catch(() => {
      // Leave the existing queue playable if recommendations are unavailable.
    });
  };

  const unsubscribe = usePlayerStore.subscribe(
    state => [state.currentTrack, state.sessionId, state.currentIndex, state.queue, state.isPlaying,
      state.repeatMode, state.autoplayEnabled, state.autoQueueSuppressed, state.queueContext.kind,
      state.isShuffling, state.shuffleOrder, state.shufflePosition] as const,
    topUp,
    { equalityFn: (left, right) => left.every((value, index) => value === right[index]) },
  );
  topUp();
  return () => { generation += 1; unsubscribe(); };
}
