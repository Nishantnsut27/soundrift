import { ContentSection } from './ContentSection';
import { TrackCardGrid } from './TrackCardGrid';
import { SkeletonGuestCardsGrid } from './Skeletons';
import { useCuratedSections, findCuratedSection } from '../hooks/useCuratedSections';
import { usePlayerStore } from '../store/playerStore';
import { GUEST_ROUTES, type GuestPreviewRouteView } from '../config/guestRoutes';

const ROW_LENGTH = 6;

/**
 * Which curated section each route previews from. These are the backend's own
 * section ids — the route reuses real data rather than inventing a stand-in, and
 * when its dedicated experience is built it replaces this component outright.
 */
const PREVIEW_SOURCE: Record<GuestPreviewRouteView, string> = {
  'new-releases': 'fresh_releases',
};

/**
 * Placeholder for the guest routes whose dedicated surface is not built yet.
 *
 * It is honest by design: it names the question the route will answer, says
 * plainly that the full experience is still coming, and points back to Home.
 * The single real row exists so the page is not a black rectangle — not so it
 * can pass for a finished page.
 */
export function GuestRoutePreview({ view }: { view: GuestPreviewRouteView }) {
  const meta = GUEST_ROUTES[view];
  const { sections, isLoading } = useCuratedSections();
  const setCurrentView = usePlayerStore((state) => state.setCurrentView);

  const section = findCuratedSection(sections, PREVIEW_SOURCE[view]);
  // Genres previews whichever regional section the engine returned.
  const fallback =
    view === 'genres'
      ? sections.find((item) => !['trending', 'editors_picks', 'fresh_releases'].includes(item.sectionId) && item.tracks.length > 0)
      : undefined;
  const preview = section ?? fallback ?? null;

  return (
    <div className="guest-route-preview">
      <header className="guest-route-head">
        <p className="t-eyebrow">{meta.label}</p>
        <h1 className="t-h1">{meta.question}</h1>
        <p className="t-body guest-route-promise">{meta.promise}</p>

        <div className="guest-route-note" role="status">
          <span className="guest-route-badge">In progress</span>
          <p className="t-meta">
            This surface is still being built. Home has the full curated experience today.
          </p>
        </div>

        <button
          type="button"
          className="sr-btn sr-btn-secondary sr-btn-sm"
          onClick={() => setCurrentView('home')}
        >
          Go to Home
        </button>
      </header>

      {isLoading && !preview ? (
        <ContentSection title="A preview from today's selection">
          <SkeletonGuestCardsGrid count={ROW_LENGTH} />
        </ContentSection>
      ) : preview ? (
        <ContentSection
          title={preview.title}
          subtitle="A preview from today's curated selection."
        >
          <TrackCardGrid
            tracks={preview.tracks.slice(0, ROW_LENGTH)}
            showRank={preview.sectionId === 'trending'}
            singleRow
          />
        </ContentSection>
      ) : null}
    </div>
  );
}
