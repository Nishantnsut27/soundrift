interface DiscoverHeroProps {
  /** Seeds the trail from a real track picked at random out of the loaded pool. */
  onSurprise: () => void;
  /** False until there is real catalogue data to pick from. */
  canSurprise: boolean;
}

/**
 * Discover's header.
 *
 * Deliberately quieter than the Home hero: no cover art, no blurred wash, no
 * featured track. Home leads with a single record because its job is "play
 * something now"; Discover leads with an instruction because its job is "go
 * looking". Making this a second full-bleed hero would be the fastest way to
 * make the two routes feel identical.
 */
export function DiscoverHero({ onSurprise, canSurprise }: DiscoverHeroProps) {
  return (
    <header className="discover-hero">
      <p className="t-eyebrow discover-hero-eyebrow">Discover</p>

      <h1 className="t-h1 discover-hero-title">Explore beyond what you already know.</h1>

      <p className="t-body discover-hero-lede">
        Start with an artist, open a collection, then follow a song outwards to whatever
        sits next to it.
      </p>

      {canSurprise && (
        <button
          type="button"
          className="sr-btn sr-btn-secondary discover-hero-action"
          onClick={onSurprise}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 3h5v5" />
            <path d="M4 20 21 3" />
            <path d="M21 16v5h-5" />
            <path d="m15 15 6 6" />
            <path d="M4 4l5 5" />
          </svg>
          Surprise me
        </button>
      )}
    </header>
  );
}
