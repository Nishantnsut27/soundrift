import { usePlayerStore } from '../store/playerStore';
import { formatArtistNames } from '../utils/formatters';
import type { Track } from '../types/types';

const FALLBACK_ART = '/Favicon.png';

interface GuestHeroProps {
  /** The real track at the head of the backend's curated trending section. */
  track: Track;
  onPlay: (track: Track) => void;
  isCurrent: boolean;
  isPlaying: boolean;
}

/**
 * The first thing a guest sees.
 *
 * Everything on it is real: the track is the top entry of the backend's curated
 * trending section, and the ambient wash behind it is that same artwork, scaled
 * and blurred. That is what "artwork-derived colour" means here — no palette
 * extraction pass, no invented accent, and nothing claimed about the track that
 * the API did not return.
 */
export function GuestHero({ track, onPlay, isCurrent, isPlaying }: GuestHeroProps) {
  const setCurrentView = usePlayerStore((state) => state.setCurrentView);
  const artist = formatArtistNames(track.artist_name);
  const artwork = track.image || track.album_image || FALLBACK_ART;
  const showPause = isCurrent && isPlaying;

  return (
    <section className="guest-hero" aria-labelledby="guest-hero-title">
      {/* Ambient wash: the same artwork, blurred. Decorative, never focusable. */}
      <div
        className="guest-hero-wash"
        style={{ backgroundImage: `url(${artwork})` }}
        aria-hidden="true"
      />

      <div className="guest-hero-inner">
        <div className="guest-hero-copy">
          <p className="t-eyebrow guest-hero-eyebrow">Featured right now</p>

          <h1 className="t-display guest-hero-title" id="guest-hero-title">
            {track.name}
          </h1>

          <p className="t-body guest-hero-meta">
            <span className="guest-hero-artist">{artist}</span>
            {track.album_name && (
              <>
                <span className="guest-hero-dot" aria-hidden="true">
                  ·
                </span>
                <span className="truncate">{track.album_name}</span>
              </>
            )}
          </p>

          <p className="t-meta guest-hero-blurb">
            Start here, then keep going. No account needed to listen.
          </p>

          <div className="guest-hero-actions">
            <button
              type="button"
              className="sr-btn sr-btn-primary guest-hero-play"
              onClick={() => onPlay(track)}
            >
              {showPause ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="6 3 20 12 6 21" />
                </svg>
              )}
              {showPause ? 'Pause' : 'Play now'}
            </button>

            <button
              type="button"
              className="sr-btn sr-btn-outline"
              onClick={() => setCurrentView('trending')}
            >
              Browse trending
            </button>
          </div>
        </div>

        <button
          type="button"
          className="guest-hero-art"
          onClick={() => onPlay(track)}
          aria-label={showPause ? `Pause ${track.name}` : `Play ${track.name} by ${artist}`}
        >
          <img
            src={artwork}
            alt=""
            width="280"
            height="280"
            decoding="async"
            onError={(event) => {
              const img = event.currentTarget;
              if (img.src.endsWith(FALLBACK_ART)) return;
              img.src = FALLBACK_ART;
            }}
          />
        </button>
      </div>
    </section>
  );
}
