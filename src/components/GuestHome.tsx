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

export function GuestHome() {
  const { results, query, isLoading, error } = usePlayerStore();
  const [recommended, setRecommended] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [popularThisWeek, setPopularThisWeek] = useState<Track[]>([]);
  const [editorsPicks, setEditorsPicks] = useState<Track[]>([]);
  const [freshReleases, setFreshReleases] = useState<Track[]>([]);
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

    MusicAPI.getDiscovery().then((discovery) => {
      if (cancelledRef.current) return;
      if (discovery) {
        const curatedTrending = dedupe(discovery.sections.trending || []);
        setTrending(curatedTrending);
        setPopularThisWeek(dedupe(discovery.sections.popularThisWeek || []));
        setFreshReleases(dedupe(discovery.sections.freshReleases || []));
        setEditorsPicks(dedupe(discovery.sections.editorsPicks || []));
        if (curatedTrending[0]) {
          MusicAPI.getRecommendations(curatedTrending[0], new Set(curatedTrending.map(t => t.id)), 12)
            .then(tracks => !cancelledRef.current && setRecommended(dedupe(tracks)))
            .catch(() => undefined);
        }
      }
      setIsLoadingSections(false);
    }).catch(() => !cancelledRef.current && setIsLoadingSections(false));

    return () => {
      cancelledRef.current = true;
    };
  }, []);

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

          {freshReleases.length > 0 && (
            <section className="home-section">
              <div className="section-header-row"><h2 className="section-title">Fresh Releases</h2></div>
              <TrackListModern tracks={freshReleases} isLoading={isLoadingSections} showAddToPlaylist />
            </section>
          )}

          <RelatedMusic />
        </>
      )}
    </div>
  );
}
