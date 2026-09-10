import { useMemo, useState } from 'react';
import { ContentSection } from './ContentSection';
import { ErrorBoundary } from './ErrorBoundary';
import { CollectionCard } from './CollectionCard';
import { DiscoverHero } from './DiscoverHero';
import { DiscoverTrail } from './DiscoverTrail';
import { ExploreSection } from './ExploreSection';
import { TrackCardGrid } from './TrackCardGrid';
import { SkeletonGuestCardsGrid } from './Skeletons';
import { useCuratedSections } from '../hooks/useCuratedSections';
import { useDiscoverTrail } from '../hooks/useDiscoverTrail';
import type { CuratedSection, Track } from '../types/types';

/** Enough artists to feel like a catalogue, few enough to scan in one pass. */
const ARTIST_LIMIT = 12;

/**
 * Discover: "I want to explore."
 *
 * The shape of this page is dictated by what Soundrift's data actually contains,
 * which was checked against the live API rather than assumed. The curated payload
 * carries five collections with real titles, real track counts and a real
 * curation timestamp; every track carries artwork, a title, an artist and an
 * album. It carries no moods, no genre tags (the genre array comes back empty on
 * every track) and no language. So Discover is built from the three facets that
 * exist — artists, collections, and the adjacency between one song and another —
 * and the mood tiles the page would obviously like to have are simply absent
 * rather than invented.
 *
 * The result is a different shape from Home on purpose. Home is a stack of rows
 * ordered by popularity; here the collections sit side by side as things to pick
 * between, and the last section moves sideways from whichever song you point at.
 *
 * One data source, shared: useCuratedSections is the same module-cached fetch
 * Home uses, so opening Discover issues no extra request for it.
 */
export function DiscoverPage() {
  const { sections, isLoading, error } = useCuratedSections();
  const trail = useDiscoverTrail();

  const collections = useMemo(
    () => sections.filter((section) => section.tracks.length > 0),
    [sections],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  /* Defaults to the first collection so the page opens with real music on it,
     while a click still moves elsewhere. */
  const openCollection: CuratedSection | undefined =
    collections.find((section) => section.sectionId === openId) ?? collections[0];

  /* Every loaded track, used as the pool for the artist list and Surprise me.
     It is the already-fetched curated payload and nothing else — Discover asks
     the network for no list of its own. */
  const pool = useMemo<Track[]>(
    () => collections.flatMap((section) => section.tracks),
    [collections],
  );

  const artists = useMemo(() => collectArtists(pool, ARTIST_LIMIT), [pool]);

  const surprise = () => {
    if (pool.length === 0) return;
    trail.explore(pool[Math.floor(Math.random() * pool.length)]);
  };

  if (isLoading && collections.length === 0) {
    return (
      <div className="discover-page">
        <div className="discover-hero discover-hero-loading" aria-hidden="true" />
        <ContentSection title="Collections to dig through">
          <SkeletonGuestCardsGrid count={4} />
        </ContentSection>
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="discover-page">
        <div className="guest-notice" role="status">
          <p className="t-body">There is nothing to explore just now.</p>
          <p className="t-meta">{error ?? 'Check your connection and try again.'}</p>
          <button
            type="button"
            className="sr-btn sr-btn-secondary sr-btn-sm"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="discover-page">
      <DiscoverHero onSurprise={surprise} canSurprise={pool.length > 0} />

      {artists.length > 0 && (
        <Slot>
          <ContentSection
            title="Start with an artist"
            subtitle="Everyone playing on Soundrift today. Opens in search."
          >
            <ExploreSection artists={artists} />
          </ContentSection>
        </Slot>
      )}

      <Slot>
        <ContentSection
          title="Collections to dig through"
          subtitle="Pick one to open it."
        >
          <div className="discover-collection-grid">
            {collections.map((section) => (
              <CollectionCard
                key={section.sectionId}
                section={section}
                isOpen={openCollection?.sectionId === section.sectionId}
                onOpen={() => setOpenId(section.sectionId)}
                panelId="discover-collection-panel"
              />
            ))}
          </div>

          {openCollection && (
            <div
              className="discover-collection-panel"
              id="discover-collection-panel"
              role="region"
              aria-label={openCollection.title}
            >
              <TrackCardGrid
                tracks={openCollection.tracks}
                queueContext={{
                  kind: 'section',
                  id: openCollection.sectionId,
                  name: openCollection.title,
                }}
                onExplore={trail.explore}
              />
            </div>
          )}
        </ContentSection>
      </Slot>

      <Slot>
        <ContentSection
          title="Follow the thread"
          subtitle="One song, and whatever the catalogue puts next to it."
        >
          <DiscoverTrail
            seed={trail.seed}
            related={trail.related}
            isLoading={trail.isLoading}
            isExhausted={trail.isExhausted}
            onExplore={trail.explore}
          />
        </ContentSection>
      </Slot>
    </div>
  );
}

/** Keeps one failing section from taking the rest of Discover down with it. */
function Slot({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="guest-notice guest-notice-inline" role="status">
          <p className="t-meta">This section could not be shown.</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * The distinct artists in the loaded catalogue.
 *
 * `artist_name` is a single comma-separated string, so a collaboration is split
 * back into the people in it — otherwise "Arijit Singh, Palak Muchhal" would be
 * offered as though it were one artist, and searching for it finds far less than
 * either name alone.
 */
function collectArtists(tracks: Track[], limit: number): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const track of tracks) {
    for (const raw of (track.artist_name || '').split(',')) {
      const name = raw.trim();
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      names.push(name);
      if (names.length >= limit) return names;
    }
  }

  return names;
}
