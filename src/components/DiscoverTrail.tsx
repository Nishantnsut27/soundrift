import { TrackCardGrid } from './TrackCardGrid';
import { SkeletonGuestCardsGrid } from './Skeletons';
import { formatArtistNames } from '../utils/formatters';
import type { RelatedMusic, Track } from '../types/types';

const ROW_LENGTH = 6;

interface DiscoverTrailProps {
  seed: Track | null;
  related: RelatedMusic | null;
  isLoading: boolean;
  isExhausted: boolean;
  /** Re-seeds the trail, so any card here becomes the next step outwards. */
  onExplore: (track: Track) => void;
}

/**
 * The trail: where one song leads.
 *
 * Three directions, each only shown when the catalogue actually returned
 * something for it — songs the provider considers similar, the rest of the
 * artist, the rest of the album. Nothing is padded out: a seed whose album has
 * no other tracks simply has no album row, and a seed that leads nowhere at all
 * says so instead of showing a grid of unrelated music.
 */
export function DiscoverTrail({ seed, related, isLoading, isExhausted, onExplore }: DiscoverTrailProps) {
  if (!seed) {
    return (
      <p className="discover-trail-hint t-meta">
        Pick <strong>Explore</strong> on any song above — or hit Surprise me — to see what
        the catalogue puts next to it.
      </p>
    );
  }

  const artist = formatArtistNames(seed.artist_name);

  return (
    <div className="discover-trail">
      <p className="discover-trail-seed t-meta">
        Following <strong className="discover-trail-seed-name">{seed.name}</strong> by {artist}
      </p>

      {isLoading ? (
        <SkeletonGuestCardsGrid count={ROW_LENGTH} />
      ) : isExhausted ? (
        <div className="guest-notice guest-notice-inline" role="status">
          <p className="t-meta">
            This one is a dead end — we could not find anything related to it. Try another
            song.
          </p>
        </div>
      ) : (
        <>
          {related && related.similarSongs.length > 0 && (
            <TrailRow
              title="More like this"
              tracks={related.similarSongs}
              onExplore={onExplore}
            />
          )}

          {related && related.moreFromArtist.length > 0 && (
            <TrailRow
              title={`More from ${artist}`}
              tracks={related.moreFromArtist}
              onExplore={onExplore}
            />
          )}

          {related && related.moreFromAlbum.length > 0 && seed.album_name && (
            <TrailRow
              title={`From ${seed.album_name}`}
              tracks={related.moreFromAlbum}
              onExplore={onExplore}
            />
          )}
        </>
      )}
    </div>
  );
}

interface TrailRowProps {
  title: string;
  tracks: Track[];
  onExplore: (track: Track) => void;
}

/** A direction out of the current seed. h3, because the trail itself owns the h2. */
function TrailRow({ title, tracks, onExplore }: TrailRowProps) {
  return (
    <section className="discover-trail-row">
      <h3 className="t-h3 discover-trail-row-title truncate">{title}</h3>
      <TrackCardGrid
        tracks={tracks.slice(0, ROW_LENGTH)}
        queue={tracks}
        queueContext={{ kind: 'section', id: `trail:${title}`, name: title }}
        onExplore={onExplore}
        singleRow
      />
    </section>
  );
}
