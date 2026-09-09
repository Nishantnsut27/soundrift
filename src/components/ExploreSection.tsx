interface ExploreSectionProps {
  /** Real artist names taken from the loaded catalogue. Never authored here. */
  artists: string[];
}

/**
 * Exploration shortcuts: the artists who are actually in today's catalogue.
 *
 * The obvious thing to build here would be mood tiles — Chill, Focus, Workout,
 * Late Night. Soundrift has no mood data: the curated payload carries no mood,
 * no genre tags (every track comes back with an empty genre array) and no
 * language field, so any mood tile would be a label attached to a search string
 * someone made up. Artists are the one facet the data really has, so that is the
 * facet offered.
 *
 * Each name hands the existing search engine a query through the same
 * `music-search` event the search field uses, which navigates to /search?q=… and
 * runs it. Discover does not search anything itself.
 */
export function ExploreSection({ artists }: ExploreSectionProps) {
  if (artists.length === 0) return null;

  return (
    <ul className="discover-chips">
      {artists.map((artist) => (
        <li key={artist}>
          <button
            type="button"
            className="discover-chip"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('music-search', { detail: artist }))
            }
          >
            <span className="truncate">{artist}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
