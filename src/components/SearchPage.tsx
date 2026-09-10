import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { clearSearchHistory, removeSearch, useSearchHistory } from '../services/searchHistory';
import { usePlayerStore } from '../store/playerStore';

/**
 * The dedicated Search surface, for guests and signed-in listeners alike.
 *
 * Search is not a second Home, so there is no discovery grid here. The page is a
 * field and its answer: everything below the input is either the results or an
 * honest statement of why there are none. Nothing is invented to fill the space.
 *
 * The input itself is the one global SearchBar. On desktop that field lives in the
 * app header (see layout.css) and the sticky container below stays hidden; on
 * small screens the header field is hidden and this container is the input. Either
 * way there is exactly one search field on screen, reading and writing one query.
 */
export function SearchPage() {
  const searchInput = usePlayerStore((state) => state.searchInput);
  const query = usePlayerStore((state) => state.query);
  const results = usePlayerStore((state) => state.results);
  const artistResults = usePlayerStore((state) => state.artistResults);
  const albumResults = usePlayerStore((state) => state.albumResults);
  const searchScope = usePlayerStore((state) => state.searchScope);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const error = usePlayerStore((state) => state.error);

  const typed = searchInput.trim();
  const committed = query.trim();
  const hasQuery = typed.length > 0 || committed.length > 0;
  /*
   * isLoading is shared with the trending fetch other views run, so it is only
   * trusted here while there is something in the field. Without that guard a
   * freshly opened Search page renders skeletons for a search nobody asked for.
   */
  const searching = isLoading && typed.length > 0;
  /*
   * Skeletons only when there is nothing to replace. Refining a query already on
   * screen keeps the previous results in place and dims them instead: tearing the
   * whole list down and rebuilding it on every extra letter is a worse answer than
   * a visibly stale one, and the field's own spinner says work is happening.
   *
   * Counted against the active scope's own slot: in the Artists scope the song
   * list is empty by design, and reading it would put skeletons over a grid of
   * artists that is already on screen.
   */
  const shownCount =
    searchScope === 'artists'
      ? artistResults.length
      : searchScope === 'albums'
        ? albumResults.length
        : results.length;
  const showSkeleton = searching && shownCount === 0;
  const isRefreshing = searching && shownCount > 0;

  return (
    <div className="search-page">
      <h1 className="search-page-title">Search</h1>

      <div className="content-search-container">
        <SearchBar />
      </div>

      {hasQuery ? (
        <div
          className={`search-results-shell${isRefreshing ? ' is-refreshing' : ''}`}
          aria-busy={searching}
        >
          <SearchResults
            tracks={results}
            query={committed || typed}
            isLoading={showSkeleton}
            error={error}
          />
        </div>
      ) : (
        <SearchIntro />
      )}
    </div>
  );
}

/**
 * State A — nothing typed yet.
 *
 * Compact by design: a line of guidance and, if the listener has searched before,
 * their own recent queries. No suggested artists, no fabricated "popular" list —
 * the only content offered is content that genuinely exists.
 */
function SearchIntro() {
  const history = useSearchHistory();

  return (
    <div className="search-intro">
      <p className="search-intro-hint">
        Search for a song, an artist or an album. Results appear as you type.
      </p>

      {history.length > 0 && (
        <section className="search-section search-recent">
          <div className="search-recent-head">
            <h2 className="search-section-title">Recent searches</h2>
            <button
              type="button"
              className="sr-btn sr-btn-quiet"
              onClick={() => void clearSearchHistory()}
            >
              Clear all
            </button>
          </div>

          <ul className="search-recent-list">
            {history.map((item) => (
              <li key={item.query} className="search-recent-item">
                <button
                  type="button"
                  className="search-recent-query"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('music-search', { detail: item.query }))
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <span className="truncate">{item.query}</span>
                </button>
                <button
                  type="button"
                  className="search-recent-remove"
                  onClick={() => void removeSearch(item.query)}
                  aria-label={`Remove ${item.query} from recent searches`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
