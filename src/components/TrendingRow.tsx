import { formatArtistNames, formatDuration } from '../utils/formatters';
import type { Track } from '../types/types';

const FALLBACK_ART = '/Favicon.png';

interface TrendingRowProps {
  track: Track;
  /** 1-based display position, derived from the order the backend returned. */
  rank: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (track: Track) => void;
}

/**
 * One row in the ranking.
 *
 * The whole row is a single play toggle rather than a card: Trending is for
 * scanning an order and pressing play, not for browsing artwork. The rank is the
 * loudest thing on the row because the rank is the point — the top three carry a
 * heavier weight (set in CSS off the `is-top` class) so importance comes from
 * position, not decoration.
 *
 * The number is real: it is this track's index in the list the backend returned,
 * nothing more. There is no play count, no percentage, no movement arrow, because
 * the data carries none of those — inventing them is exactly what the brief
 * forbids.
 */
export function TrendingRow({ track, rank, isCurrent, isPlaying, onPlay }: TrendingRowProps) {
  const artist = formatArtistNames(track.artist_name);
  const active = isCurrent && isPlaying;
  const rankLabel = String(rank).padStart(2, '0');

  return (
    <li className={`trending-row${rank <= 3 ? ' is-top' : ''}${isCurrent ? ' is-current' : ''}`}>
      <span className="trending-rank" aria-hidden="true">
        {rankLabel}
      </span>

      <button
        type="button"
        className="trending-row-main"
        onClick={() => onPlay(track)}
        aria-label={`${active ? 'Pause' : 'Play'} ${track.name} by ${artist}, number ${rank} trending`}
      >
        <span className="trending-row-art">
          <img
            src={track.image || track.album_image || FALLBACK_ART}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              const img = event.currentTarget;
              if (img.src.endsWith(FALLBACK_ART)) return;
              img.src = FALLBACK_ART;
            }}
          />
          <span className="trending-row-play" aria-hidden="true">
            {active ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </span>
        </span>

        <span className="trending-row-text">
          <span className="trending-row-title truncate">{track.name}</span>
          <span className="trending-row-artist truncate">{artist}</span>
        </span>
      </button>

      <span className="trending-row-duration" aria-hidden="true">
        {formatDuration(track.duration)}
      </span>
    </li>
  );
}
