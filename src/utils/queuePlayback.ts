import type { Track } from '../types/types';

interface QueuePosition {
  queue: readonly Track[];
  currentIndex: number;
  isShuffling: boolean;
  shuffleOrder: readonly number[];
  shufflePosition: number;
  repeatMode: 'none' | 'one' | 'all';
}

/** Shared by playback and prefetch so both choose the same queue occurrence. */
export function getNextQueuePosition(state: QueuePosition): { index: number; shufflePosition: number } | null {
  if (state.queue.length === 0) return null;
  if (state.repeatMode === 'one') {
    return state.currentIndex >= 0 ? { index: state.currentIndex, shufflePosition: state.shufflePosition } : null;
  }
  if (state.isShuffling && state.shuffleOrder.length > 0) {
    let position = state.shufflePosition + 1;
    if (position >= state.shuffleOrder.length) {
      if (state.repeatMode !== 'all') return null;
      position = 0;
    }
    const index = state.shuffleOrder[position];
    return state.queue[index] ? { index, shufflePosition: position } : null;
  }
  let index = state.currentIndex + 1;
  if (index >= state.queue.length) {
    if (state.repeatMode !== 'all') return null;
    index = 0;
  }
  return { index, shufflePosition: state.shufflePosition };
}
