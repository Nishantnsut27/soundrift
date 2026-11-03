import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { seekBy } from './usePlayer';

export function useKeyboardShortcuts() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (isCoarsePointer) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target) return;
      // A focused control already acted on this key, or it belongs to the browser/OS.
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (target.isContentEditable) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (target.closest('.volume-slider, .volume, [role="slider"]')) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      }

      const store = usePlayerStore.getState();
      const key = event.key;
      const code = event.code;

      if (key === ' ' || code === 'Space') {
        // Space activates the focused control itself; toggling here as well would undo it.
        if (target.closest('button, a, [role="button"], [role="option"], input, textarea, select, [contenteditable]')) return;
        event.preventDefault();
        if (store.currentTrack) {
          store.setIsPlaying(!store.isPlaying);
        }
        return;
      }

      if (key === 'ArrowLeft') {
        event.preventDefault();
        seekBy(-5);
        return;
      }

      if (key === 'ArrowRight') {
        event.preventDefault();
        seekBy(5);
        return;
      }

      if (key === 'ArrowUp') {
        event.preventDefault();
        store.setVolume(Math.min(100, store.volume + 10));
        return;
      }

      if (key === 'ArrowDown') {
        event.preventDefault();
        store.setVolume(Math.max(0, store.volume - 10));
        return;
      }

      if (key === 'm' || key === 'M' || code === 'KeyM') {
        event.preventDefault();
        store.toggleMute();
        return;
      }

      if (key === 's' || key === 'S' || code === 'KeyS') {
        event.preventDefault();
        store.toggleShuffle();
        return;
      }

      if (key === 'r' || key === 'R' || code === 'KeyR') {
        event.preventDefault();
        const nextRepeat = store.repeatMode === 'none' ? 'all' : store.repeatMode === 'all' ? 'one' : 'none';
        store.setRepeatMode(nextRepeat);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
