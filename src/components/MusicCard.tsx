import type { ReactNode } from 'react';
import type { Track } from '../types/types';
import { formatArtistNames } from '../utils/formatters';

const FALLBACK_ART = '/Favicon.png';

interface MusicCardProps {
  track: Track;
  onPlay: (track: Track) => void;
  /** Marks the card as the track currently loaded in the player. */
  isCurrent?: boolean;
  /** Whether the player is actually playing, used only for the play/pause glyph. */
  isPlaying?: boolean;
  /** 1-based position, rendered as an editorial rank when showRank is set. */
  rank?: number;
  showRank?: boolean;
  /**
   * Overflow menu. Only pass this when the actions behind it genuinely exist for
   * the current user — an empty menu is worse than no menu.
   */
  menu?: ReactNode;
}

/**
 * The single card used for every track grid.
 *
 * Sizing is fixed by construction rather than by content: the artwork is a 1:1
 * box and the metadata block is exactly two single-line rows, so every card in
 * a row is the same height no matter how long the title is.
 */
export function MusicCard({
  track,
  onPlay,
  isCurrent = false,
  isPlaying = false,
  rank,
  showRank = false,
  menu,
}: MusicCardProps) {
  const artist = formatArtistNames(track.artist_name);
  const showPause = isCurrent && isPlaying;

  return (
    <article className={`music-card${isCurrent ? ' is-current' : ''}`}>
      <button
        type="button"
        className="music-card-art"
        onClick={() => onPlay(track)}
        aria-label={showPause ? `Pause ${track.name}` : `Play ${track.name} by ${artist}`}
      >
        <img
          className="music-card-art-img"
          src={track.image || track.album_image || FALLBACK_ART}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.endsWith(FALLBACK_ART)) return;
            img.src = FALLBACK_ART;
          }}
        />

        {showRank && rank !== undefined && (
          <span className="music-card-rank" aria-hidden="true">
            {String(rank).padStart(2, '0')}
          </span>
        )}

        <span className="music-card-play" aria-hidden="true">
          {showPause ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21" />
            </svg>
          )}
        </span>
      </button>

      <div className="music-card-meta">
        <p className="music-card-title truncate" title={track.name}>
          {track.name}
        </p>
        <p className="music-card-artist truncate" title={artist}>
          {artist}
        </p>
      </div>

      {menu && <div className="music-card-menu">{menu}</div>}
    </article>
  );
}
