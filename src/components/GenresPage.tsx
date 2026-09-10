import { useEffect, useRef, useState } from 'react';
import { ContentSection } from './ContentSection';
import { ErrorBoundary } from './ErrorBoundary';
import { BrowseCard } from './BrowseCard';
import { SkeletonGuestCardsGrid } from './Skeletons';
import { useCuratedSections, findCuratedSection } from '../hooks/useCuratedSections';
import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from '../services/musicApi';
import { GENRE_CATEGORIES } from '../config/genres';
import type { CuratedSection, PlaylistSummary } from '../types/types';

const FALLBACK_ART = '/Favicon.png';

/** Queries used to pull real playlists from the catalogue's own editorial sets. */
const PLAYLIST_QUERIES = ['bollywood', 'punjabi', 'romantic', 'workout'];

/**
 * The artwork for a category tile, taken from the first track that actually has
 * art. Real album art from inside the category — nothing generated, and no
 * stand-in cover invented for a category that has none.
 */
function tileArt(section: CuratedSection): string | null {
  for (const track of section.tracks) {
    const art = track.album_image || track.image;
    if (art) return art;
  }
  return null;
}

/**
 * Genres: "What kind of music do I want?"
 *
 * A category grid, browsed rather than searched. The catalogue has no genre
 * taxonomy — zero tracks carry genre metadata and the API has no genre
 * endpoint — so the categories here are the curation engine's own themed
 * sections, which are real and have real tracks behind them. A category whose
 * section has not been generated yet is omitted, never shown empty.
 *
 * Reads the same cached curated payload Home uses, so the grid costs no extra
 * requests. Only the editorial playlist row below it fetches.
 */
export function GenresPage() {
  const { sections, isLoading, error } = useCuratedSections();
  const openGenre = usePlayerStore((state) => state.openGenre);

  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    Promise.all(PLAYLIST_QUERIES.map((query) => MusicAPI.searchPlaylists(query, 4)))
      .then((groups) => {
        if (!activeRef.current) return;
        const seen = new Set<string>();
        const merged: PlaylistSummary[] = [];
        for (const group of groups) {
          for (const playlist of group) {
            if (!playlist?.id || seen.has(playlist.id)) continue;
            seen.add(playlist.id);
            merged.push(playlist);
          }
        }
        setPlaylists(merged);
      })
      .catch(() => {
        /* The category grid stands on its own if this row fails. */
        if (activeRef.current) setPlaylists([]);
      })
      .finally(() => {
        if (activeRef.current) setIsLoadingPlaylists(false);
      });

    return () => {
      activeRef.current = false;
    };
  }, []);

  /* Only categories the curation engine has actually filled. */
  const available = GENRE_CATEGORIES.map((category) => ({
    category,
    section: findCuratedSection(sections, category.id),
  })).filter((entry): entry is { category: typeof entry.category; section: CuratedSection } =>
    entry.section !== null && entry.section.tracks.length > 0
  );

  const showEmpty =
    !isLoading && available.length === 0 && !isLoadingPlaylists && playlists.length === 0;

  return (
    <div className="genres-page">
      <header className="browse-head">
        <p className="t-eyebrow">Genres</p>
        <h1 className="t-h1">Explore music by category</h1>
        <p className="t-body browse-head-promise">
          Pick a mood or an era and let it lead the way.
        </p>
      </header>

      {isLoading && available.length === 0 ? (
        <section className="content-section">
          <div className="content-section-body">
            <SkeletonGuestCardsGrid count={6} />
          </div>
        </section>
      ) : available.length > 0 ? (
        <ErrorBoundary
          fallback={
            <div className="guest-notice guest-notice-inline" role="status">
              <p className="t-meta">These categories could not be shown.</p>
            </div>
          }
        >
          <section className="content-section">
            <div className="content-section-body">
              <div className="genre-tile-grid">
                {available.map(({ category, section }) => {
                  const art = tileArt(section);
                  return (
                    <button
                      type="button"
                      key={category.id}
                      className="genre-tile"
                      onClick={() => openGenre(category.id)}
                      aria-label={`Browse ${section.title || category.label}`}
                    >
                      <span className="genre-tile-art" aria-hidden="true">
                        {art ? (
                          <img
                            src={art}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              e.currentTarget.src = FALLBACK_ART;
                              e.currentTarget.onerror = null;
                            }}
                          />
                        ) : null}
                      </span>
                      <span className="genre-tile-body">
                        <span className="genre-tile-name t-h3">
                          {section.title || category.label}
                        </span>
                        <span className="genre-tile-blurb t-micro">{category.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </ErrorBoundary>
      ) : null}

      {isLoadingPlaylists ? (
        <ContentSection title="Playlists" subtitle="Ready-made playlists from the catalogue.">
          <SkeletonGuestCardsGrid count={6} />
        </ContentSection>
      ) : playlists.length > 0 ? (
        <ErrorBoundary
          fallback={
            <div className="guest-notice guest-notice-inline" role="status">
              <p className="t-meta">These playlists could not be shown.</p>
            </div>
          }
        >
          <ContentSection
            title="Playlists"
            subtitle="Ready-made playlists from the catalogue."
          >
            <div className="browse-card-grid">
              {playlists.map((playlist) => (
                <BrowseCard
                  key={playlist.id}
                  kind="playlist"
                  id={playlist.id}
                  name={playlist.name}
                  image={playlist.image}
                  meta={
                    typeof playlist.songCount === 'number' && playlist.songCount > 0
                      ? `${playlist.songCount} songs`
                      : null
                  }
                  onOpen={() => openGenre(`playlist:${playlist.id}`)}
                />
              ))}
            </div>
          </ContentSection>
        </ErrorBoundary>
      ) : null}

      {showEmpty && (
        <div className="guest-notice" role="status">
          <p className="t-body">No genres available yet.</p>
          <p className="t-meta">
            {error
              ? 'The catalogue could not be reached just now.'
              : 'Categories fill in on the next curation cycle.'}
          </p>
        </div>
      )}
    </div>
  );
}
