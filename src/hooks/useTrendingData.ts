import { useMemo } from 'react';
import { findCuratedSection, useCuratedSections } from './useCuratedSections';
import { usePlayerStore } from '../store/playerStore';
import type { CuratedSection, Track } from '../types/types';

/** The backend's own id for the ordered trending collection. */
const TRENDING_SECTION_ID = 'trending';

export interface TrendingData {
  /** The ordered list. Position here is real; see the note below. */
  section: CuratedSection | null;
  ranked: Track[];
  /** Real trending tracks whose order carries no meaning. Never numbered. */
  more: Track[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Trending's data, from the two real sources that already exist.
 *
 * Which order is trustworthy matters more here than anywhere else in the app,
 * because this page's whole job is to present one:
 *
 *  - `curated.trending` ("Trending Now") IS ordered. The curation engine asks for
 *    trending songs in India right now, and curationService re-sorts the resolved
 *    tracks back into the candidate order it got them in, so position 1 is the
 *    engine's first answer rather than an accident. This is what gets numbered.
 *
 *  - `/api/music/trending` is NOT ordered. musicService.getTrending shuffles the
 *    deduplicated pool before slicing it, so its first element is arbitrary and
 *    changes every 45 seconds. These are real trending tracks, so they are worth
 *    showing — but numbering them would invent a ranking, so they are rendered as
 *    an unranked grid.
 *
 * Neither source is fetched here. The curated payload comes from the shared
 * module-cached hook Home and Discover already use, and the trending pool is the
 * store slot App fills once at startup. Trending issues no request of its own.
 */
export function useTrendingData(): TrendingData {
  const { sections, isLoading, error } = useCuratedSections();
  const pool = usePlayerStore((state) => state.trending);

  const section = findCuratedSection(sections, TRENDING_SECTION_ID);
  const ranked = useMemo(() => section?.tracks ?? [], [section]);

  /* The unranked pool minus anything already numbered above, so the second
     section adds tracks rather than repeating the ranking. */
  const more = useMemo(() => {
    if (pool.length === 0) return [];
    const rankedIds = new Set(ranked.map((track) => track.id));
    return pool.filter((track) => !rankedIds.has(track.id));
  }, [pool, ranked]);

  const hasRanking = ranked.length > 0;

  return {
    section,
    ranked,
    more,
    /* Loading only while there is nothing to show. A background refresh must
       never blank out a ranking that is already on screen. */
    isLoading: !hasRanking && isLoading,
    error: hasRanking ? null : error,
  };
}
