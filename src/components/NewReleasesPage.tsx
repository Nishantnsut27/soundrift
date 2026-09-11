import { useState } from 'react';
import { ContentSection } from './ContentSection';
import { TrackListModern } from './TrackListModern';
import { BrowseCard } from './BrowseCard';
import { ErrorBoundary } from './ErrorBoundary';
import { SkeletonGuestCardsGrid, SkeletonTrackList } from './Skeletons';
import { useCuratedSections, findCuratedSection } from '../hooks/useCuratedSections';
import { useNewReleases, albumYearValue } from '../hooks/useNewReleases';
import { usePlayerStore } from '../store/playerStore';
import type { Album } from '../types/types';

/**
 * The filters, which map onto the two real datasets this page has. There is no
 * Today / This Week / This Month selector because the catalogue carries no
 * per-song timestamps to back one — a control that cannot change the data is
 * not offered.
 */
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'albums', label: 'Albums' },
  { id: 'songs', label: 'Songs' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

/**
 * New Releases: "What has recently arrived on Soundrift?"
 *
 * Freshness rather than popularity — the distinction from Trending, which
 * ranks. Two real sources: albums fetched with the provider's own latest-first
 * ordering, shown as artwork cards with their real year, and the curated
 * fresh-releases songs as compact rows.
 *
 * No relative timestamps appear anywhere on this page. The provider sends no
 * per-song release date on search results, so "added 3 hours ago" would be
 * invented, and it is not shown.
 */
export function NewReleasesPage() {
  const { sections, isLoading: isLoadingSections, error: sectionsError } = useCuratedSections();
  const fresh = findCuratedSection(sections, 'fresh_releases');
  const { albums, songs, isLoadingAlbums, albumsError } = useNewReleases(
    sections,
    fresh?.tracks ?? [],
    isLoadingSections
  );
  const openAlbum = usePlayerStore((state) => state.openAlbum);

  const [filter, setFilter] = useState<FilterId>('all');

  const showAlbums = filter === 'all' || filter === 'albums';
  const showSongs = filter === 'all' || filter === 'songs';

  const hasAlbums = albums.length > 0;
  const hasSongs = songs.length > 0;
  const isBusy = isLoadingSections || isLoadingAlbums;
  const isEmpty = !isBusy && !hasAlbums && !hasSongs;

  const albumMeta = (album: Album): string => {
    const year = albumYearValue(album);
    return [album.artist_name, year !== null ? String(year) : null].filter(Boolean).join(' · ');
  };

  return (
    <div className="new-releases-page">
      <header className="browse-head">
        <p className="t-eyebrow">New Releases</p>
        <h1 className="t-h1">Fresh music, recently added to Soundrift</h1>
        <p className="t-body browse-head-promise">
          The newest arrivals in the catalogue, not the most played.
        </p>

        {(hasAlbums || hasSongs) && (
          <div className="browse-filters" role="group" aria-label="Filter new releases">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`sr-btn sr-btn-quiet sr-btn-sm browse-filter${
                  filter === option.id ? ' is-active' : ''
                }`}
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {showAlbums && (isLoadingAlbums || hasAlbums) && (
        <ErrorBoundary
          fallback={
            <div className="guest-notice guest-notice-inline" role="status">
              <p className="t-meta">These albums could not be shown.</p>
            </div>
          }
        >
          <ContentSection
            title="Latest albums"
            subtitle="Newest first, using the catalogue's own ordering."
          >
            {isLoadingAlbums && !hasAlbums ? (
              <SkeletonGuestCardsGrid count={8} />
            ) : (
              <div className="browse-card-grid">
                {albums.map((album) => (
                  <BrowseCard
                    key={album.id}
                    kind="album"
                    id={album.id}
                    name={album.name}
                    image={album.image}
                    meta={albumMeta(album)}
                    onOpen={() => openAlbum(album.id)}
                  />
                ))}
              </div>
            )}
          </ContentSection>
        </ErrorBoundary>
      )}

      {showSongs && (isLoadingSections || hasSongs) && (
        <ErrorBoundary
          fallback={
            <div className="guest-notice guest-notice-inline" role="status">
              <p className="t-meta">These songs could not be shown.</p>
            </div>
          }
        >
          <ContentSection
            title="Recently added"
            subtitle="New songs picked up by Soundrift's curation."
          >
            {isLoadingSections && !hasSongs ? (
              <SkeletonTrackList count={6} />
            ) : (
              <TrackListModern
                tracks={songs}
                variant="list"
                showAddToPlaylist
                queueContext={{ kind: 'section', id: 'fresh_releases', name: 'Recently added' }}
              />
            )}
          </ContentSection>
        </ErrorBoundary>
      )}

      {/* One dataset present but the active filter hides it. */}
      {!isBusy && !isEmpty && showAlbums && !showSongs && !hasAlbums && (
        <div className="guest-notice" role="status">
          <p className="t-body">No new albums to show.</p>
          <p className="t-meta">Try the Songs filter for the latest additions.</p>
        </div>
      )}
      {!isBusy && !isEmpty && showSongs && !showAlbums && !hasSongs && (
        <div className="guest-notice" role="status">
          <p className="t-body">No new songs to show.</p>
          <p className="t-meta">Try the Albums filter for the latest additions.</p>
        </div>
      )}

      {isEmpty && (
        <div className="guest-notice" role="status">
          <p className="t-body">New releases aren't available yet.</p>
          <p className="t-meta">
            {sectionsError || albumsError
              ? 'The catalogue could not be reached just now.'
              : 'Check back soon for new music.'}
          </p>
        </div>
      )}
    </div>
  );
}
