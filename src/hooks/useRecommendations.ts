import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from '../services/musicApi';

export function useRecommendations() {
  const trackId = usePlayerStore(s => s.currentTrack?.id);
  const currentIndex = usePlayerStore(s => s.currentIndex);
  const queueLength = usePlayerStore(s => s.queue.length);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const autoplayEnabled = usePlayerStore(s => s.autoplayEnabled);
  const recommendationsLength = usePlayerStore(s => s.recommendations.length);
  const recentlyPlayed = usePlayerStore(s => s.recentlyPlayed);

  const storeRef = useRef(usePlayerStore.getState());
  const lastFetchedRef = useRef<string>('');
  const loadingRef = useRef(false);

  useEffect(() => {
    const unsub = usePlayerStore.subscribe((s) => { storeRef.current = s; });
    return unsub;
  }, []);

  useEffect(() => {
    if (!trackId || !autoplayEnabled) {
      storeRef.current.clearRecommendations();
      return;
    }
    if (lastFetchedRef.current === trackId) return;
    lastFetchedRef.current = trackId;
    loadingRef.current = false;
    storeRef.current.clearRecommendations();
  }, [trackId, autoplayEnabled]);

  useEffect(() => {
    if (!trackId || !autoplayEnabled || !isPlaying) return;
    if (repeatMode === 'one') return;

    const remaining = queueLength - currentIndex - 1;
    if (remaining > 3) return;
    if (recommendationsLength > 0) return;
    if (loadingRef.current) return;

    loadingRef.current = true;

    const s = storeRef.current;
    const currentTrack = s.currentTrack;
    if (!currentTrack) { loadingRef.current = false; return; }

    const excludeIds = new Set<string>([
      trackId,
      ...s.queue.map(t => t.id),
      ...recentlyPlayed.slice(0, 20).map(t => t.id),
    ]);

    MusicAPI.getRecommendations(currentTrack, excludeIds, 10)
      .then(tracks => {
        if (String(storeRef.current.currentTrack?.id) !== String(currentTrack.id)) return;
        storeRef.current.setRecommendations(tracks);
      })
      .catch(() => {})
      .finally(() => {
        loadingRef.current = false;
      });
  }, [trackId, currentIndex, queueLength, isPlaying, autoplayEnabled, repeatMode, recommendationsLength, recentlyPlayed]);

  }
