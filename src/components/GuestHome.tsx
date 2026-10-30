import type { ReactNode } from 'react';
import { ContentSection } from './ContentSection';
import { ErrorBoundary } from './ErrorBoundary';
import { GuestHero } from './GuestHero';
import { TrackCardGrid } from './TrackCardGrid';
import { SkeletonGuestCardsGrid } from './Skeletons';
import { useCuratedSections, findCuratedSection } from '../hooks/useCuratedSections';
import { useTrackPlayback } from '../hooks/useTrackPlayback';
import { usePlayerStore } from '../store/playerStore';
import { requireAuth } from '../utils/requireAuth';
import type { CuratedSection, QueueContext, Track } from '../types/types';
import { useEffect, useMemo, useState } from 'react';

/** One clean row per section; the phone rail scrolls through the rest. */
const ROW_LENGTH = 6;

/** Backend section ids that Home gives dedicated editorial treatment. */
const TRENDING_ID = 'trending';
const FRESH_ID = 'fresh_releases';
const EDITORS_ID = 'editors_picks';
const FEATURED_IDS = [TRENDING_ID, FRESH_ID, EDITORS_ID];

/** Shared by the hero and the trending row, which play the same list. */
const TRENDING_CONTEXT: QueueContext = {
  kind: 'section',
  id: TRENDING_ID,
  name: 'Trending now',
};

const FEATURE_ROTATION_MS = 12_000;

/**
 * Guest Home: "what should I listen to?"
 *
 * Reads the backend's curated payload once (via useCuratedSections) and gives
 * each section the editorial framing it earns rather than printing five
 * identical rows. Every track, title and cover comes from that payload or from
 * the trending list the app already loaded — nothing here is authored.
 *
 * Sections render independently: a section missing from the payload is simply
 * absent, and an error boundary around each one keeps a single bad row from
 * taking the page down with it.
 */
export function GuestHome() {
  const { sections, isLoading, error } = useCuratedSections();
  const storeTrending = usePlayerStore((state) => state.trending);
  const setCurrentView = usePlayerStore((state) => state.setCurrentView);
  const openGenre = usePlayerStore((state) => state.openGenre);

  const trendingSection = findCuratedSection(sections, TRENDING_ID);
  const freshSection = findCuratedSection(sections, FRESH_ID);
  const editorsSection = findCuratedSection(sections, EDITORS_ID);

  // Anything else the curation engine returns (K-Pop, Worldwide, and whatever
  // is added server-side later) keeps its backend title and renders after the
  // three named rows.
  const extraSections = useMemo(
    () =>
      sections.filter(
        (section) => !FEATURED_IDS.includes(section.sectionId) && section.tracks.length > 0,
      ),
    [sections],
  );

  // Keep the hero sourced from the same live payload as the visible rows.
  // Mixing sections makes the featured song useful for discovery instead of
  // repeating the first Trending Now track indefinitely.
  const trendingTracks = trendingSection?.tracks ?? storeTrending;
  const featureSources = useMemo(() => {
    const candidates: Array<{ track: Track; queue: Track[]; context: QueueContext }> = [];
    const sourceSections = [
      ...(trendingTracks.length ? [{ sectionId: TRENDING_ID, title: 'Trending now', tracks: trendingTracks }] : []),
      ...(freshSection ? [freshSection] : []),
      ...(editorsSection ? [editorsSection] : []),
      ...extraSections,
    ];
    const seen = new Set<string>();

    for (const section of sourceSections) {
      for (const track of section.tracks) {
        const id = String(track.id ?? '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        candidates.push({
          track,
          queue: section.tracks,
          context: { kind: 'section', id: section.sectionId, name: section.title },
        });
      }
    }

    return candidates;
  }, [trendingTracks, freshSection, editorsSection, extraSections]);

  const [featureIndex, setFeatureIndex] = useState(0);
  useEffect(() => {
    setFeatureIndex(0);
  }, [featureSources]);
  useEffect(() => {
    if (featureSources.length < 2) return;
    const timer = window.setInterval(() => {
      setFeatureIndex((current) => (current + 1) % featureSources.length);
    }, FEATURE_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [featureSources.length]);

  const featuredSource = featureSources[featureIndex % Math.max(featureSources.length, 1)];
  const featured = featuredSource?.track;
  const featureQueue = featuredSource?.queue ?? trendingTracks;
  const featureContext = featuredSource?.context ?? TRENDING_CONTEXT;

  // The feature's Play button must use the queue of the row it came from, so
  // Next continues through Fresh Releases / Editor's Picks when appropriate.
  const { toggleTrack, currentTrackId, isPlaying } = useTrackPlayback(
    featureQueue,
    featureContext,
  );

  const hasAnything = featureSources.length > 0;

  if (isLoading && !hasAnything) {
    return (
      <div className="guest-home">
        <div className="guest-hero guest-hero-loading" aria-hidden="true" />
        <ContentSection title="Trending now">
          <SkeletonGuestCardsGrid count={ROW_LENGTH} />
        </ContentSection>
        <ContentSection title="Fresh releases">
          <SkeletonGuestCardsGrid count={ROW_LENGTH} />
        </ContentSection>
      </div>
    );
  }

  if (!hasAnything) {
    return (
      <div className="guest-home">
        <div className="guest-notice" role="status">
          <p className="t-body">We could not load music just now.</p>
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
    <div className="guest-home">
      {featured && (
        <ErrorBoundary fallback={null}>
          <GuestHero
            track={featured}
            onPlay={toggleTrack}
            isCurrent={currentTrackId === featured.id}
            isPlaying={isPlaying}
          />
        </ErrorBoundary>
      )}

      {trendingTracks.length > 0 && (
        <SectionSlot>
          <ContentSection
            title="Trending now"
            subtitle="What listeners are playing today."
            action={{ label: 'See all', onClick: () => setCurrentView('trending') }}
          >
            <TrackCardGrid
              tracks={trendingTracks.slice(0, ROW_LENGTH)}
              queue={trendingTracks}
              queueContext={TRENDING_CONTEXT}
              showRank
              singleRow
            />
          </ContentSection>
        </SectionSlot>
      )}

      {freshSection && (
        <SectionSlot>
          <CuratedRow
            section={freshSection}
            title="Fresh releases"
            subtitle="New music worth hearing."
            onSeeAll={() => setCurrentView('new-releases')}
          />
        </SectionSlot>
      )}

      {editorsSection && (
        <SectionSlot>
          <CuratedRow
            section={editorsSection}
            title="Editor's picks"
            subtitle="Hand-picked by the Soundrift curation engine."
            eyebrow="Curated"
          />
        </SectionSlot>
      )}

      {extraSections.map((section) => (
        <SectionSlot key={section.sectionId}>
          <CuratedRow
            section={section}
            title={section.title}
            subtitle="More ways in."
            onSeeAll={() => openGenre(section.sectionId)}
          />
        </SectionSlot>
      ))}

      {/* Conversion panel. Last, on purpose: discovery comes first, and the ask
          only makes sense once there is something worth saving. */}
      <section className="guest-invite" aria-labelledby="guest-invite-title">
        <div className="guest-invite-copy">
          <h2 className="t-h2" id="guest-invite-title">
            Make Soundrift yours
          </h2>
          <p className="t-meta guest-invite-lines">
            Save favorites. Create playlists. Sync across devices.
          </p>
        </div>
        <button
          type="button"
          className="sr-btn sr-btn-primary"
          onClick={() => requireAuth('login')}
        >
          Sign In / Register
        </button>
      </section>
    </div>
  );
}

/** Keeps one failing row from taking the rest of Home down with it. */
function SectionSlot({ children }: { children: ReactNode }) {
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

interface CuratedRowProps {
  section: CuratedSection;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onSeeAll?: () => void;
}

function CuratedRow({ section, title, subtitle, eyebrow, onSeeAll }: CuratedRowProps) {
  const action = onSeeAll ? { label: 'See all', onClick: onSeeAll } : undefined;

  return (
    <ContentSection title={title} subtitle={subtitle} eyebrow={eyebrow} action={action}>
      {/* The row shows six; the queue is the whole section, so Next reaches the
          rest of it before the suggestion engine gets a turn. */}
      <TrackCardGrid
        tracks={section.tracks.slice(0, ROW_LENGTH)}
        queue={section.tracks}
        queueContext={{ kind: 'section', id: section.sectionId, name: title }}
        singleRow
      />
    </ContentSection>
  );
}
