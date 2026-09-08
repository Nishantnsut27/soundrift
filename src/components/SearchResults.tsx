import { TrackListModern } from './TrackListModern';
import { SkeletonSearchResults } from './Skeletons';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import type { Track } from '../types/types';

const FALLBACK_ART = '/Favicon.png';

/**
 * Search results, ranked by type rather than laid out as one flat grid.
 *
 * Songs come first and get the density of a list, because a song is the thing a
 * search is nearly always for. Artists and albums follow as secondary rows: they
 * are ways to widen the search, not results to play. Every section is conditional,
 * so a query that only matches songs shows only songs — no reserved blank regions.
 *
 * Artists and albums are derived from the tracks the search already returned. The
 * backend search returns tracks and nothing else, so there is no second request
 * here, and no entity that the catalogue cannot back.
 */
export function SearchResults({
  tracks,
  query,
  isLoading,
  error,
}: {
  tracks: Track[];
  query: string;
  isLoading: boolean;
  error?: string | null;
}) {
  const playlists = usePlayerStore((state) => state.playlists);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);

  if (isLoading) return <SkeletonSearchResults />;
  if (error) return <SearchFailed message={error} />;
  if (!tracks.length) return <SearchNoResults query={query} />;

  const [topResult, ...otherSongs] = tracks;
  const artists = unique(tracks, (track) => track.artist_name).slice(0, 6);
  const albums = unique(tracks.filter((track) => track.album_name), (track) => track.album_name).slice(0, 6);
  const matchedPlaylists = playlists
    .filter((playlist) => playlist.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 4);

  const playTop = () => {
    const store = usePlayerStore.getState();
    if (store.currentTrack?.id === topResult.id) {
      if (store.isPlaying) store.pauseTrack();
      else store.setIsPlaying(true);
      return;
    }
    store.playTrack(topResult);
  };

  const isTopCurrent = currentTrack?.id === topResult.id;

  return (
    <div className="search-results">
      <section className="search-section">
        <h2 className="search-section-title">Top result</h2>
        <button
          type="button"
          className={`search-top-result${isTopCurrent ? ' is-current' : ''}`}
          onClick={playTop}
          aria-label={
            isTopCurrent && isPlaying
              ? `Pause ${topResult.name}`
              : `Play ${topResult.name} by ${topResult.artist_name}`
          }
        >
          <span className="search-top-result-art">
            <img
              src={topResult.album_image || topResult.image || FALLBACK_ART}
              alt=""
              loading="lazy"
              decoding="async"
              onError={onArtError}
            />
            <span className="search-play-badge" aria-hidden="true">
              {isTopCurrent && isPlaying ? <PauseGlyph /> : <PlayGlyph />}
            </span>
          </span>
          <span className="search-top-result-text">
            <span className="search-top-result-name truncate">{topResult.name}</span>
            <span className="search-top-result-meta truncate">
              Song · {topResult.artist_name}
            </span>
          </span>
        </button>
      </section>

      {otherSongs.length > 0 && (
        <section className="search-section">
          <h2 className="search-section-title">Songs</h2>
          <TrackListModern tracks={otherSongs} variant="list" showAddToPlaylist />
        </section>
      )}

      {artists.length > 0 && (
        <section className="search-section">
          <h2 className="search-section-title">Artists</h2>
          <div className="search-artist-grid">
            {artists.map((track) => (
              <button
                type="button"
                key={track.artist_id || track.artist_name}
                className="search-artist"
                onClick={() => requestSearch(track.artist_name)}
                aria-label={`Search for ${track.artist_name}`}
              >
                <img
                  className="search-artist-art"
                  src={track.image || track.album_image || FALLBACK_ART}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={onArtError}
                />
                <span className="search-artist-name truncate" title={track.artist_name}>
                  {track.artist_name}
                </span>
                <span className="search-entity-kind">Artist</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section className="search-section">
          <h2 className="search-section-title">Albums</h2>
          <div className="search-album-grid">
            {albums.map((track) => (
              <button
                type="button"
                key={track.album_id || track.album_name}
                className="search-album"
                onClick={() => requestSearch(track.album_name)}
                aria-label={`Search for the album ${track.album_name}`}
              >
                <span className="search-album-art">
                  <img
                    src={track.album_image || track.image || FALLBACK_ART}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={onArtError}
                  />
                </span>
                <span className="search-album-name truncate" title={track.album_name}>
                  {track.album_name}
                </span>
                <span className="search-entity-kind truncate">{track.artist_name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {isAuthenticated && matchedPlaylists.length > 0 && (
        <section className="search-section">
          <h2 className="search-section-title">Your playlists</h2>
          <div className="search-album-grid">
            {matchedPlaylists.map((playlist) => (
              <button
                type="button"
                key={playlist.id}
                className="search-album"
                onClick={() => usePlayerStore.getState().setCurrentView('playlists')}
                aria-label={`Open playlist ${playlist.name}`}
              >
                <span className="search-album-art">
                  <img
                    src={playlist.tracks[0]?.album_image || playlist.tracks[0]?.image || FALLBACK_ART}
                    alt=""
                    loading="lazy"
                    onError={onArtError}
                  />
                </span>
                <span className="search-album-name truncate" title={playlist.name}>
                  {playlist.name}
                </span>
                <span className="search-entity-kind">
                  {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Asks the one search engine to run a query. */
const requestSearch = (value: string) =>
  window.dispatchEvent(new CustomEvent('music-search', { detail: value }));

const onArtError = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  if (img.src.endsWith(FALLBACK_ART)) return;
  img.src = FALLBACK_ART;
};

/**
 * Recoverable, and scoped to the results area: the field above keeps its text, so
 * retrying is one click and nothing has to be typed again.
 */
function SearchFailed({ message }: { message: string }) {
  const retry = () => {
    const { searchInput, query } = usePlayerStore.getState();
    const value = searchInput.trim() || query.trim();
    if (value) requestSearch(value);
  };

  return (
    <div className="search-notice search-notice-error" role="alert">
      <h2 className="search-notice-title">Search could not be completed</h2>
      <p className="search-notice-text">{message}</p>
      <button type="button" className="sr-btn sr-btn-primary sr-btn-sm" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

/** No matches. States that plainly and suggests nothing that was not searched for. */
function SearchNoResults({ query }: { query: string }) {
  return (
    <div className="search-notice">
      <h2 className="search-notice-title">No results for “{query}”</h2>
      <p className="search-notice-text">
        Check the spelling, or try just the artist or song name without extra words.
      </p>
      <button
        type="button"
        className="sr-btn sr-btn-secondary sr-btn-sm"
        onClick={() => usePlayerStore.getState().clearResults()}
      >
        Clear search
      </button>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6 3 20 12 6 21" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function unique(tracks: Track[], key: (track: Track) => string) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const value = key(track).toLowerCase();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
