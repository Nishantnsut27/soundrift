import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from '../services/musicApi';

const TOP_UP_THRESHOLD = 2;
const REQUEST_BATCH = 10;

export function useRecommendations() {
  const trackId = usePlayerStore(s => s.currentTrack?.id);
  const currentIndex = usePlayerStore(s => s.currentIndex);
  const queueLength = usePlayerStore(s => s.queue.length);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const autoplayEnabled = usePlayerStore(s => s.autoplayEnabled);
  const sessionId = usePlayerStore(s => s.sessionId);
  const queueKind = usePlayerStore(s => s.queueContext.kind);

  const storeRef = useRef(usePlayerStore.getState());
  const loadingRef = useRef(false);
  const fetcherIdRef = useRef(0);

  const topUpRef = useRef<(sourceTrackId: string) => Promise<void>>(async () => {});
  topUpRef.current = async (sourceTrackId: string) => {
    if (loadingRef.current) return;
    const s = storeRef.current;
    const sourceTrack = s.currentTrack;
    if (!sourceTrack || String(sourceTrack.id) !== String(sourceTrackId)) return;

    const session = s.sessionId;
    const attempt = ++fetcherIdRef.current;
    loadingRef.current = true;

    try {
      const excludeIds = new Set<string>([
        sourceTrackId,
        ...s.queue.map(t => t.id),
        ...s.playbackHistory.map(t => t.id),
        ...s.recentlyPlayed.slice(0, 30).map(t => t.id),
      ]);

      const tracks = await MusicAPI.getRecommendations(sourceTrack, excludeIds, REQUEST_BATCH);

      const latest = storeRef.current;
      if (attempt !== fetcherIdRef.current) return;
      if (latest.sessionId !== session) return;
      if (String(latest.currentTrack?.id) !== String(sourceTrackId)) return;

      await latest.setRecommendations(tracks);
    } catch (err) {
      void err;
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    fetcherIdRef.current += 1;
    loadingRef.current = false;
  }, [trackId, sessionId]);

  useEffect(() => {
    const unsub = usePlayerStore.subscribe((s) => { storeRef.current = s; });
    return unsub;
  }, []);

  useEffect(() => {
    if (!trackId || !autoplayEnabled || !isPlaying) return;
    if (repeatMode === 'one') return;
    // An album or a playlist is a finite thing the listener opened. Next walks it
    // to the end and stops. A loose track and a rendered section both earn a
    // radio, but the section only once the threshold below says it is running out.
    if (queueKind === 'album' || queueKind === 'playlist') return;

    const remaining = queueLength - currentIndex - 1;
    if (remaining > TOP_UP_THRESHOLD) return;

    void topUpRef.current(trackId);
  }, [trackId, currentIndex, queueLength, isPlaying, autoplayEnabled, repeatMode, sessionId, queueKind]);
}
