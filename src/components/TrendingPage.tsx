import { ContentSection } from './ContentSection';
import { ErrorBoundary } from './ErrorBoundary';
import { TrendingHeader } from './TrendingHeader';
import { TrendingList } from './TrendingList';
import { TrackCardGrid } from './TrackCardGrid';
import { SkeletonTrackList } from './Skeletons';
import { useTrendingData } from '../hooks/useTrendingData';

/** Enough of the unranked pool to be worth a look, not enough to bury the ranking. */
const MORE_LIMIT = 12;

/**
 * Trending: "What is popular right now?"
 *
 * A ranked page, not another card wall. The ordered list is the whole layout and
 * the position is the hierarchy — the top three are heavier, and #1 carries the
 * only accent on the page.
 *
 * Two sections, because there are exactly two real trending datasets and they
 * differ in one important way: the curated section has a meaningful order and is
 * numbered, the trending pool does not and is not. See useTrendingData.
 *
 * What is absent is deliberate. The payload carries no play counts, no listener
 * numbers, no rank movement and no time periods, so there is no statistics strip,
 * no up/down arrows and no Today/This week selector — each would be a control or
 * a figure with nothing behind it. There is no "Rising" section either: the
 * backend has no rising dataset that any route exposes.
 */
export function TrendingPage() {
  const { section, ranked, more, isLoading, error } = useTrendingData();

  return (
    <div className="trending-page">
      <TrendingHeader updatedAt={section?.updatedAt || section?.generatedAt} />

      {isLoading ? (
        <div className="trending-list-shell" aria-busy="true">
          <span className="visually-hidden">Loading trending music…</span>
          <SkeletonTrackList count={10} />
        </div>
      ) : error ? (
        <div className="guest-notice" role="alert">
          <p className="t-body">Trending is temporarily unavailable.</p>
          <p className="t-meta">Something went wrong loading the ranking.</p>
          <button
            type="button"
            className="sr-btn sr-btn-secondary sr-btn-sm"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      ) : ranked.length === 0 ? (
        <div className="guest-notice" role="status">
          <p className="t-body">Not enough trending data yet.</p>
          <p className="t-meta">Check back soon for what&rsquo;s moving on Soundrift.</p>
        </div>
      ) : (
        <ErrorBoundary
          fallback={
            <div className="guest-notice guest-notice-inline" role="status">
              <p className="t-meta">The ranking could not be shown.</p>
            </div>
          }
        >
          <TrendingList tracks={ranked} />
        </ErrorBoundary>
      )}

      {more.length > 0 && (
        <ErrorBoundary
          fallback={
            <div className="guest-notice guest-notice-inline" role="status">
              <p className="t-meta">This section could not be shown.</p>
            </div>
          }
        >
          <div className="trending-more">
            <ContentSection
              title="More trending"
              subtitle="A wider pull from what's playing. This selection isn't ranked."
            >
              <TrackCardGrid
                tracks={more.slice(0, MORE_LIMIT)}
                queueContext={{ kind: 'section', id: 'trending-more', name: 'More trending' }}
              />
            </ContentSection>
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}
