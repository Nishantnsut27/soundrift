import { formatRelativeTime } from '../utils/formatters';

interface TrendingHeaderProps {
  /** Real timestamp of the last curation run. Omitted when absent. */
  updatedAt?: string;
}

/**
 * Trending's header.
 *
 * Compact by design: a label, a line, and straight into the ranking. Home earns
 * a full-bleed hero because its job is "play something now"; Trending's job is
 * "show me the order", so the first ranked row should be visible without
 * scrolling. No artwork, no featured record — the numbers below are the visual.
 *
 * The freshness line is the one piece of metadata on the page, and it is real:
 * the timestamp of the curation run that produced this ordering. It is dropped
 * entirely when the backend did not send one.
 */
export function TrendingHeader({ updatedAt }: TrendingHeaderProps) {
  const refreshed = updatedAt ? formatRelativeTime(updatedAt) : null;

  return (
    <header className="trending-header">
      <p className="t-eyebrow trending-header-eyebrow">Trending</p>
      <h1 className="t-h1 trending-header-title">What&rsquo;s moving right now.</h1>
      <p className="t-body trending-header-lede">
        The music people are listening to on Soundrift.
      </p>
      {refreshed && <p className="t-meta trending-header-stamp">Refreshed {refreshed}</p>}
    </header>
  );
}
