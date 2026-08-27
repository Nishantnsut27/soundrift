import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from '../services/musicApi';
import type { Track } from '../types/types';
import { TrackListModern } from './TrackListModern';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { RelatedMusic } from './RelatedMusic';
import { ErrorDisplay } from './ErrorDisplay';
import { CuratedSections } from './CuratedSections';

const CATEGORY_SEEDS = ['pop', 'rock', 'hip-hop', 'electronic', 'indie', 'edm', 'jazz', 'classical'];

const daySeed = (offset: number) => {
  const day = Math.floor(Date.now() / 86400000);
  return CATEGORY_SEEDS[(day + offset) % CATEGORY_SEEDS.length];
};

export function GuestHome() {
  const { results, query, isLoading, error, trending } = usePlayerStore();
  const [recommended, setRecommended] = useState<Track[]>([]);
  const [popularThisWeek, setPopularThisWeek] = useState<Track[]>([]);
  const [editorsPicks, setEditorsPicks] = useState<Track[]>([]);
  const [isLoadingSections, setIsLoadingSections] = useState(true);
  const cancelledRef = useRef(false);

  const isSearching = query.trim().length > 0 || results.length > 0;

  useEffect(() => {
    cancelledRef.current = false;
    setIsLoadingSections(true);

    const seen = new Set<string>();
    const dedupe = (list: Track[]) =>
      list.filter((t) => {
        if (!t.audio || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

    const seed = trending[0];
    const recommendedSource = seed
      ? MusicAPI.getRecommendations(seed, new Set(trending.map((t) => t.id)), 12).catch(() => [] as Track[])
      : Promise.resolve([] as Track[]);

    Promise.allSettled([
      recommendedSource,
      MusicAPI.getTracksByGenre(daySeed(1), 12).catch(() => [] as Track[]),
      MusicAPI.getTracksByGenre(daySeed(2), 12).catch(() => [] as Track[]),
    ]).then(([rec, popular, picks]) => {
      if (cancelledRef.current) return;
      if (rec.status === 'fulfilled') setRecommended(dedupe(rec.value));
      if (popular.status === 'fulfilled') setPopularThisWeek(dedupe(popular.value));
      if (picks.status === 'fulfilled') setEditorsPicks(dedupe(picks.value));
      setIsLoadingSections(false);
    });

    return () => {
      cancelledRef.current = true;
    };
  }, [trending]);

  if (error) {
    return (
      <div className="view-container">
        <div className="content-search-container">
          <SearchBar />
        </div>
        <ErrorDisplay
          title="Music Temporarily Unavailable"
          message={error}
          onRetry={() => window.location.reload()}
          onDismiss={() => usePlayerStore.getState().setError(null)}
        />
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="content-search-container">
        <SearchBar />
      </div>

      {isSearching ? (
        <SearchResults tracks={results} query={query} isLoading={isLoading} />
      ) : (
        <>
          <CuratedSections />

          {recommended.length > 0 && (
            <section className="home-section">
              <div className="section-header-row">
                <h2 className="section-title">Recommended For You</h2>
              </div>
              <TrackListModern tracks={recommended} isLoading={isLoadingSections} showAddToPlaylist />
            </section>
          )}

          {trending.length > 0 && (
            <section className="home-section">
              <div className="section-header-row">
                <h2 className="section-title">Trending Now</h2>
              </div>
              <TrackListModern tracks={trending} isLoading={isLoadingSections} showAddToPlaylist />
            </section>
          )}

          {popularThisWeek.length > 0 && (
            <section className="home-section">
              <div className="section-header-row">
                <h2 className="section-title">Popular This Week</h2>
              </div>
              <TrackListModern tracks={popularThisWeek} isLoading={isLoadingSections} showAddToPlaylist />
            </section>
          )}

          {editorsPicks.length > 0 && (
            <section className="home-section">
              <div className="section-header-row">
                <h2 className="section-title">Editor's Picks</h2>
              </div>
              <TrackListModern tracks={editorsPicks} isLoading={isLoadingSections} showAddToPlaylist />
            </section>
          )}

          <RelatedMusic />
        </>
      )}
    </div>
  );
}
