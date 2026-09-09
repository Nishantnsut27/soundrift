import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicAPI } from '../services/musicApi';
import type { RelatedMusic, Track } from '../types/types';

/**
 * The exploration trail: one seed track and the music the catalogue actually
 * relates to it.
 *
 * This is what makes Discover an exploration surface rather than a second Home.
 * Home ranks; this drifts — you pick a song, see what sits next to it, pick one
 * of those, and keep moving outward.
 *
 * The adjacency is not computed here and is not invented: it is
 * `MusicAPI.getRelatedMusic`, the same call the authenticated RelatedMusic panel
 * makes, which asks the provider for suggestions and for the rest of the artist
 * and album. Results are cached per track id inside the service, so stepping back
 * to a track already visited costs nothing.
 *
 * Unlike RelatedMusic this is driven by what the listener chose to explore rather
 * than by what is playing, and it deliberately does not write to the shared
 * `relatedMusic` store slot — exploring a song must not disturb the player.
 */
export interface DiscoverTrailState {
  seed: Track | null;
  related: RelatedMusic | null;
  isLoading: boolean;
  /** A lookup finished and every direction came back empty. */
  isExhausted: boolean;
  explore: (track: Track) => void;
}

/** True when the provider gave us nothing in any direction. */
const isEmpty = (related: RelatedMusic | null): boolean =>
  !related ||
  (related.similarSongs.length === 0 &&
    related.moreFromArtist.length === 0 &&
    related.moreFromAlbum.length === 0);

export function useDiscoverTrail(): DiscoverTrailState {
  const [seed, setSeed] = useState<Track | null>(null);
  const [related, setRelated] = useState<RelatedMusic | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExhausted, setIsExhausted] = useState(false);

  /* Monotonic, so a slow lookup for an abandoned seed can never overwrite the
     one the listener is actually looking at. */
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (!seed) return;

    const requestId = ++sequenceRef.current;
    setIsLoading(true);
    setIsExhausted(false);

    MusicAPI.getRelatedMusic(seed)
      .then((result) => {
        if (requestId !== sequenceRef.current) return;
        setRelated(result);
        setIsExhausted(isEmpty(result));
      })
      .catch(() => {
        /* A failed lookup is reported as a dead end, not as fabricated
           neighbours and not as a crash: the rest of Discover stays usable. */
        if (requestId !== sequenceRef.current) return;
        setRelated(null);
        setIsExhausted(true);
      })
      .finally(() => {
        if (requestId !== sequenceRef.current) return;
        setIsLoading(false);
      });
  }, [seed]);

  const explore = useCallback((track: Track) => {
    setSeed((current) => (current?.id === track.id ? current : track));
  }, []);

  return { seed, related, isLoading, isExhausted, explore };
}
