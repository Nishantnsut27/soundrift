import { TrackListModern } from './TrackListModern';
import { ErrorBoundary } from './ErrorBoundary';
import { SkeletonTrackList } from './Skeletons';
import { useAlbumDetail } from '../hooks/useAlbumDetail';
import { usePlayerStore } from '../store/playerStore';
import type { Album } from '../types/types';

const FALLBACK_ART = '/Favicon.png';

/** The year, when the provider sent one. Never inferred. */
function albumYear(album: Album): string | null {
  if (album.year) return String(album.year);
  if (album.releasedate) {
    const year = new Date(album.releasedate).getFullYear();
    if (!Number.isNaN(year)) return String(year);
  }
  return null;
}

/**
 * The album page.
 *
 * `/api/albums` returns the track list inline, so this is a single request and
 * the whole page is real data: cover, title, the artist as a link to their page,
 * the year and the song count, then the tracks.
 *
 * The song count is taken from the tracks actually present rather than the
 * provider's `songCount`, so the number under the title always matches the list
 * underneath it.
 */
export function AlbumPage({ albumId }: { albumId: string }) {
  const { album, isLoading, error } = useAlbumDetail(albumId);
  const setCurrentView = usePlayerStore((state) => state.setCurrentView);

  if (isLoading && !album) {
    return (
      <div className="album-page" aria-busy="true">
        <span className="visually-hidden">Loading album…</span>
        <SkeletonTrackList count={8} />
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="album-page">
        <div className="guest-notice" role="alert">
          <p className="t-body">{error ?? 'This album could not be loaded.'}</p>
          <p className="t-meta">The page may have moved, or the catalogue may not have it.</p>
          <button
            type="button"
            className="sr-btn sr-btn-secondary sr-btn-sm"
            onClick={() => setCurrentView('home')}
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const tracks = album.songs ?? album.tracks ?? [];
  const year = albumYear(album);

  return (
    <div className="album-page">
      <header className="album-header">
        <div className="album-header-art">
          <img
            src={album.image || FALLBACK_ART}
            alt=""
            loading="eager"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src = FALLBACK_ART;
              e.currentTarget.onerror = null;
            }}
          />
        </div>

        <div className="album-header-body">
          <p className="t-eyebrow">Album</p>
          <h1 className="t-h1 album-header-name">{album.name}</h1>

          {album.artist_name && (
            <p className="album-header-artist">
              <span className="t-body">{album.artist_name}</span>
            </p>
          )}

          <p className="t-meta album-header-meta">
            {[year, tracks.length > 0 ? `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      {tracks.length === 0 ? (
        <div className="guest-notice" role="status">
          <p className="t-body">No tracks are listed for this album.</p>
          <p className="t-meta">The catalogue has the album but none of its songs yet.</p>
        </div>
      ) : (
        <ErrorBoundary
          fallback={
            <div className="guest-notice guest-notice-inline" role="status">
              <p className="t-meta">This track list could not be shown.</p>
            </div>
          }
        >
          <section className="content-section album-tracks">
            <div className="content-section-body">
              <TrackListModern
                tracks={tracks}
                variant="list"
                showAddToPlaylist
                queueContext={{ kind: 'album', id: album.id, name: album.name }}
              />
            </div>
          </section>
        </ErrorBoundary>
      )}
    </div>
  );
}
