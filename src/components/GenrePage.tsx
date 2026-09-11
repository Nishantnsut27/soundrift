import { useEffect, useRef, useState } from 'react';
import { TrackListModern } from './TrackListModern';
import { ErrorBoundary } from './ErrorBoundary';
import { SkeletonTrackList } from './Skeletons';
import { useCuratedSections, findCuratedSection } from '../hooks/useCuratedSections';
import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from '../services/musicApi';
import { findGenreCategory } from '../config/genres';
import type { Track } from '../types/types';

/** Ids prefixed this way address a JioSaavn editorial playlist rather than a category. */
const PLAYLIST_PREFIX = 'playlist:';

/**
 * The music inside one category.
 *
 * Two sources, because the Genres grid browses two real things. A category id
 * resolves against the cached curated payload, so opening one costs no request
 * at all. A `playlist:` id is a JioSaavn editorial playlist and is fetched.
 *
 * Reached through the same `detailEntity` route the artist and album pages use,
 * so the URL carries the category and Back behaves normally.
 */
export function GenrePage({ genreId }: { genreId: string }) {
  const { sections, isLoading: isLoadingSections } = useCuratedSections();
  const setCurrentView = usePlayerStore((state) => state.setCurrentView);

  const isPlaylist = genreId.startsWith(PLAYLIST_PREFIX);
  const playlistId = isPlaylist ? genreId.slice(PLAYLIST_PREFIX.length) : null;

  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [playlistName, setPlaylistName] = useState<string>('');
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(isPlaylist);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (!playlistId) {
      setPlaylistTracks([]);
      setPlaylistName('');
      setIsLoadingPlaylist(false);
      setPlaylistError(null);
      return;
    }

    const requestId = ++sequenceRef.current;
    setIsLoadingPlaylist(true);
    setPlaylistError(null);

    MusicAPI.getPlaylistById(playlistId)
      .then((result) => {
        if (requestId !== sequenceRef.current) return;
        if (!result) {
          setPlaylistError('This playlist could not be opened.');
          setPlaylistTracks([]);
          setPlaylistName('');
          return;
        }
        setPlaylistTracks(result.tracks ?? []);
        setPlaylistName(result.name ?? '');
      })
      .catch(() => {
        if (requestId !== sequenceRef.current) return;
        setPlaylistError('This playlist could not be opened.');
        setPlaylistTracks([]);
      })
      .finally(() => {
        if (requestId !== sequenceRef.current) return;
        setIsLoadingPlaylist(false);
      });
  }, [playlistId]);

  const category = isPlaylist ? null : findGenreCategory(genreId);
  const section = isPlaylist ? null : findCuratedSection(sections, genreId);

  const title = isPlaylist ? playlistName : section?.title || category?.label || '';
  const blurb = isPlaylist
    ? 'A ready-made playlist from the catalogue.'
    : category?.blurb ?? '';
  const tracks = isPlaylist ? playlistTracks : section?.tracks ?? [];
  const isLoading = isPlaylist ? isLoadingPlaylist : isLoadingSections;

  const backToGenres = (
    <button
      type="button"
      className="sr-btn sr-btn-secondary sr-btn-sm"
      onClick={() => setCurrentView('genres')}
    >
      Back to Genres
    </button>
  );

  if (isLoading && tracks.length === 0) {
    return (
      <div className="genre-page" aria-busy="true">
        <span className="visually-hidden">Loading category…</span>
        <SkeletonTrackList count={8} />
      </div>
    );
  }

  /* An unknown id, a failed playlist, or a category the engine has not filled. */
  if (playlistError || tracks.length === 0) {
    return (
      <div className="genre-page">
        <div className="guest-notice" role="status">
          <p className="t-body">{playlistError ?? 'Nothing to show in this category yet.'}</p>
          <p className="t-meta">
            {playlistError
              ? 'The catalogue may not have it any more.'
              : 'It fills in on the next curation cycle.'}
          </p>
          {backToGenres}
        </div>
      </div>
    );
  }

  return (
    <div className="genre-page">
      <header className="browse-head genre-head">
        <p className="t-eyebrow">{isPlaylist ? 'Playlist' : 'Genre'}</p>
        <h1 className="t-h1">{title}</h1>
        {blurb && <p className="t-body browse-head-promise">{blurb}</p>}
        <div className="genre-head-actions">{backToGenres}</div>
      </header>

      <ErrorBoundary
        fallback={
          <div className="guest-notice guest-notice-inline" role="status">
            <p className="t-meta">This track list could not be shown.</p>
          </div>
        }
      >
        <section className="content-section">
          <div className="content-section-body">
            <TrackListModern
              tracks={tracks}
              variant="list"
              showAddToPlaylist
              /* A playlist plays through to its end and stops. A genre category
                 is a curated theme, so Next walks it and the radio picks up
                 where it runs out. */
              queueContext={
                playlistId
                  ? { kind: 'playlist', id: playlistId, name: playlistName || title }
                  : { kind: 'section', id: `genre:${title}`, name: title }
              }
            />
          </div>
        </section>
      </ErrorBoundary>
    </div>
  );
}
